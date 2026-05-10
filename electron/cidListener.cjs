/**
 * CIDSHOW Caller ID DLL bridge.
 *
 * Mantık:
 *   - cid.dll vendor SDK'sını koffi ile yükler.
 *   - SetEvents(_CallerID, _Signal) çağrılır; cihaz çağrısı ya da bağlantı durumu
 *     değiştikçe DLL kendi thread'inden callback tetikler.
 *   - Callback'leri JS tarafında yakalayıp UI'ya iletmek için module düzeyinde
 *     emitter pattern kullanırız (aksi halde GC callback'i çöpe atabilir).
 *
 * Not (SDK'dan): "softtest.txt" dosyası uygulamanın çalıştığı klasörde varsa DLL
 * sahte periyodik çağrılar üretir. Geliştirme modunda bunu kullanırız.
 */
const path = require('path');
const fs = require('fs');

let koffi = null;
try {
  koffi = require('koffi');
} catch (e) {
  // koffi olmadan modül yine yüklenebilir; isAvailable() false döner.
}

/** Build (asar) içinden DLL'i çözer ve asar.unpacked'a yönlendirir. */
function resolveDllPath(arch) {
  const archFolder = arch === 'ia32' ? 'ia32' : 'x64';
  const candidate = path.join(__dirname, 'native', 'cid', archFolder, 'cid.dll');
  const unpacked = candidate.includes(`${path.sep}app.asar${path.sep}`)
    ? candidate.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    : candidate;
  if (fs.existsSync(unpacked)) return unpacked;
  return candidate;
}

/**
 * Koffi'nin tip kaydı SÜREÇ GLOBAL'idir — `koffi.proto('_CallerID', ...)` ikinci
 * kez çağrıldığında "duplicate type name '_CallerID'" fırlatır. Ayrıca registered
 * function prototype'i parametre tipi olarak string adıyla kullanırsanız (`lib.func('SetEvents(_CallerID ...)')`)
 * "type _CallerID cannot be used as a parameter" hatası fırlatır — koffi 2.x
 * function prototype'ı parametre olarak kullanmak için açık `koffi.pointer(proto)`
 * sarmalamasını şart koşuyor.
 *
 * Çözüm:
 *   1. Proto referansını `globalThis._sefposCidGlobals` içinde tut → modül HMR
 *      veya require cache invalidation sonrası bile aynı obje kullanılır,
 *      duplicate hatası oluşmaz.
 *   2. `lib.func` çağrısını programmatik (array form) yap ve parametreleri
 *      `koffi.pointer(proto)` ile geç → string parser tetiklenmez.
 *   3. `koffi.register` zaten `koffi.pointer(proto)` ile çağrılıyor; orası OK.
 */
const G_KEY = '__sefpos_cid_globals__';
const cidGlobals = (globalThis[G_KEY] = globalThis[G_KEY] || {});

function getCallerIdProto() {
  if (cidGlobals.callerIdProto) return cidGlobals.callerIdProto;
  cidGlobals.callerIdProto = koffi.proto(
    'void __cdecl _CallerID(str16 DeviceSerial, str16 Line, str16 PhoneNumber, str16 DateTime, str16 Other)'
  );
  return cidGlobals.callerIdProto;
}

function getSignalProto() {
  if (cidGlobals.signalProto) return cidGlobals.signalProto;
  cidGlobals.signalProto = koffi.proto(
    'void __cdecl _Signal(str16 DeviceModel, str16 DeviceSerial, int Signal1, int Signal2, int Signal3, int Signal4)'
  );
  return cidGlobals.signalProto;
}

/** Aynı DLL'i tekrar tekrar yüklememek için yine global cache. */
function loadLibCached(dllPath) {
  if (cidGlobals.lib && cidGlobals.libPath === dllPath) return cidGlobals.lib;
  cidGlobals.lib = koffi.load(dllPath);
  cidGlobals.libPath = dllPath;
  return cidGlobals.lib;
}

class CidListener {
  constructor() {
    this.lib = null;
    this.callerIDCb = null;
    this.signalCb = null;
    this.setEventsFn = null;
    this.dllPath = null;
    this.deviceConnected = false;
    this.deviceModel = '';
    this.deviceSerial = '';
    this.softTestActive = false;
    this.lastError = null;

    /** @type {(payload: object) => void | null} */
    this.onCall = null;
    /** @type {(payload: object) => void | null} */
    this.onSignal = null;
    /** @type {(err: Error) => void | null} */
    this.onError = null;
  }

  isAvailable() {
    return !!koffi && process.platform === 'win32';
  }

  isRunning() {
    return !!this.setEventsFn;
  }

  start(opts = {}) {
    if (!this.isAvailable()) {
      throw new Error('Caller ID yalnızca Windows + koffi ile çalışır.');
    }
    if (this.isRunning()) return this.status();

    this.dllPath = opts.dllPath || resolveDllPath(opts.arch || process.arch);
    if (!fs.existsSync(this.dllPath)) {
      throw new Error('cid.dll bulunamadı: ' + this.dllPath);
    }

    if (opts.softTest) {
      try {
        const target = path.join(process.cwd(), 'softtest.txt');
        if (!fs.existsSync(target)) {
          fs.writeFileSync(target, 'sefpos softtest enabled\n', 'utf8');
        }
        this.softTestActive = true;
      } catch (e) {
        this.softTestActive = false;
        this._emitError(new Error('softtest.txt yazılamadı: ' + e.message));
      }
    }

    this.lib = loadLibCached(this.dllPath);

    /**
     * Vendor SDK imzaları (Test.cpp):
     *   typedef void(__cdecl *_CallerID)(LPWSTR DeviceSerial, LPWSTR Line,
     *                                    LPWSTR PhoneNumber, LPWSTR DateTime,
     *                                    LPWSTR Other);
     *   typedef void(__cdecl *_Signal)(LPWSTR DeviceModel, LPWSTR DeviceSerial,
     *                                  int Signal1, int Signal2, int Signal3, int Signal4);
     *   void SetEvents(_CallerID, _Signal);
     *
     * LPWSTR = wchar_t* (Windows = UTF-16). Koffi'de "str16" otomatik decode eder.
     * Tipler bir kez kaydedildikten sonra cache'den okunur.
     */
    const callerIdProto = getCallerIdProto();
    const signalProto = getSignalProto();

    // Array form: parametre tipleri programmatik geçilince koffi'nin string
    // parser'ı devre dışı kalır → "type _CallerID cannot be used as a parameter"
    // hatası ortadan kalkar. Function prototype'ı parametre olarak vermek için
    // mutlaka koffi.pointer(...) ile sarmalanır.
    this.setEventsFn = this.lib.func('SetEvents', 'void', [
      koffi.pointer(callerIdProto),
      koffi.pointer(signalProto),
    ]);

    this.callerIDCb = koffi.register((deviceSerial, line, phoneNumber, dateTime, other) => {
      try {
        const payload = {
          deviceSerial: stringOrEmpty(deviceSerial),
          line: stringOrEmpty(line),
          phone: normalizePhone(stringOrEmpty(phoneNumber)),
          rawPhone: stringOrEmpty(phoneNumber),
          dateTime: stringOrEmpty(dateTime),
          other: stringOrEmpty(other),
          ts: Date.now(),
        };
        if (typeof this.onCall === 'function') this.onCall(payload);
      } catch (e) {
        this._emitError(e);
      }
    }, koffi.pointer(callerIdProto));

    this.signalCb = koffi.register((deviceModel, deviceSerial, s1, s2, s3, s4) => {
      try {
        const model = stringOrEmpty(deviceModel);
        const serial = stringOrEmpty(deviceSerial);
        const connected = model.length > 0;
        this.deviceConnected = connected;
        this.deviceModel = model;
        this.deviceSerial = serial;
        if (typeof this.onSignal === 'function') {
          this.onSignal({
            connected,
            deviceModel: model,
            deviceSerial: serial,
            signals: [s1, s2, s3, s4],
            ts: Date.now(),
          });
        }
      } catch (e) {
        this._emitError(e);
      }
    }, koffi.pointer(signalProto));

    this.setEventsFn(this.callerIDCb, this.signalCb);
    return this.status();
  }

  stop() {
    try {
      if (this.callerIDCb && koffi) koffi.unregister(this.callerIDCb);
    } catch {
      /* yoksay */
    }
    try {
      if (this.signalCb && koffi) koffi.unregister(this.signalCb);
    } catch {
      /* yoksay */
    }
    this.callerIDCb = null;
    this.signalCb = null;
    this.setEventsFn = null;
    this.lib = null;
  }

  status() {
    return {
      available: this.isAvailable(),
      running: this.isRunning(),
      dllPath: this.dllPath,
      connected: this.deviceConnected,
      deviceModel: this.deviceModel,
      deviceSerial: this.deviceSerial,
      softTest: this.softTestActive,
      lastError: this.lastError ? String(this.lastError.message || this.lastError) : null,
    };
  }

  _emitError(err) {
    this.lastError = err;
    if (typeof this.onError === 'function') {
      try {
        this.onError(err);
      } catch {
        /* yoksay */
      }
    } else {
      console.error('[CidListener]', err);
    }
  }
}

function stringOrEmpty(v) {
  if (v == null) return '';
  return String(v);
}

/** Türkiye telefonlarında boşluk/çizgi/parantez temizler; sayısal kalır. */
function normalizePhone(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^0-9+]/g, '');
}

module.exports = { CidListener, resolveDllPath };
