const { app, BrowserWindow, shell, ipcMain, net, dialog, Menu } = require('electron');
const { writeSecureJson, readSecureJson } = require('./secureLocalStore.cjs');
const {
  acquireMainInstanceFileLock,
  registerReleaseOnAppQuit,
  terminateOtherMainSefposProcesses,
} = require('./singletonLock.cjs');
const { installElectronContentSecurityPolicy } = require('./csp.cjs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Bazı sürücü + Windows DWM kombinasyonlarında ekranda sürekli titreme / yeniden boyama olur.
 * Kalıcı iyileştirme: Chromium anahtarları + pencereyi önce gösterip sonra büyütme.
 * Hâlâ titreme varsa: SEFPOS_DISABLE_HARDWARE_ACCELERATION=1 (veya ELECTRON_DISABLE_GPU=1) ile GPU kapatılabilir.
 */
if (
  process.platform === 'win32' &&
  (process.env.SEFPOS_DISABLE_HARDWARE_ACCELERATION === '1' || process.env.ELECTRON_DISABLE_GPU === '1')
) {
  app.disableHardwareAcceleration();
}
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  // Varsayılan: arka planda Chromium zamanlayıcıları kısılır (Opera + ŞefPOS birlikteyken CPU şişmesini azaltır).
  // Ekran titremesi devam ederse: SEFPOS_FULL_SPEED_BACKGROUND=1
  if (process.env.SEFPOS_FULL_SPEED_BACKGROUND === '1') {
    app.commandLine.appendSwitch('disable-background-timer-throttling');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
  }
}

// --------------------------------------------------------------------------
// Tek örnek: Electron kilidi + Windows dosya kilidi. İkinci Sefpos.exe açılırsa
// yeni süreç hemen kapanır, mevcut pencere öne gelir.
// Not: Görev Yöneticisi'nde 4–6 "Sefpos.exe" satırı tek uygulamanın Chromium
// alt süreçleri olabilir (gpu, renderer); bunlar normaldir. Sorun, birden fazla
// ana pencere / ayrı oturumlardır — aşağıdaki kilit bunu engeller.
// --------------------------------------------------------------------------
if (!acquireMainInstanceFileLock()) {
  process.exit(0);
}
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  process.exit(0);
}
registerReleaseOnAppQuit(app);
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    try {
      createWindow();
    } catch (e) {
      paLog('error', '[window] second-instance createWindow', { message: e?.message || String(e) });
    }
    return;
  }
  revealMainWindow({ maximize: false, reason: 'second-instance' });
});
const fs = require('fs');
const os = require('os');
const https = require('https');

/** Windows/Electron: stdout kapalıyken console.* EPIPE ile main process'i çökertmesin. */
function installSafeConsolePipes() {
  const swallow = (stream) => {
    if (!stream || typeof stream.on !== 'function') return;
    stream.on('error', (err) => {
      if (err && (err.code === 'EPIPE' || err.code === 'ENOTCONN')) return;
    });
  };
  swallow(process.stdout);
  swallow(process.stderr);
}
installSafeConsolePipes();

process.on('uncaughtException', (err) => {
  if (err && (err.code === 'EPIPE' || err.code === 'ENOTCONN')) return;
  safeConsoleWrite(console.error, '[sefpos-main] uncaughtException:', err?.message || err);
});

function safeConsoleWrite(writeFn, ...args) {
  try {
    writeFn(...args);
  } catch (err) {
    if (err?.code !== 'EPIPE' && err?.code !== 'ENOTCONN') {
      /* ignore broken pipe */
    }
  }
}

/** Repo kökündeki sefpos-dev-port.json — tek kaynak (Vite ile aynı) */
function readSefposDevServerPort() {
  try {
    const fp = path.join(__dirname, '..', 'sefpos-dev-port.json');
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const n = Number(j.port);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  } catch (_) {}
  return 5180;
}

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {}

/**
 * Kullanıcının Settings → Sistem ekranından "Güncellemeleri kontrol et"
 * butonuna basıp basmadığını ayırt etmek için flag. `update-error` event'i
 * yalnızca bu flag true iken renderer'a iletilir; otomatik arka plan
 * kontrolünde 404/network hatalarıyla kullanıcı rahatsız edilmez.
 */
let _manualUpdateCheckInFlight = false;
/** Manuel / zorunlu kontrol sonrası hata olaylarını renderer'a ilet (ms epoch). */
let _manualUpdateCheckUntil = 0;

/** React mount olmadan gelen güncelleme olayları kaybolmasın diye son yük (IPC ile replay). */
let _pendingUpdateAvailablePayload = null;
let _pendingUpdateDownloadedPayload = null;
let _updaterPeriodicHandle = null;
let _updaterPeriodicStarted = false;
let _initialUpdaterChecksScheduled = false;
/** `updater-listeners-ready` ile planlanan ilk kontrol zamanlayıcısı (çift planlamayı önler). */
let _rendererReadyTimer = null;
/** Pencere odağı / geri dönüş ile yapılan ek kontroller (çift istek önleme). */
let _lastUserActivityUpdateCheckAt = 0;
let _autoUpdaterErrorSent = false;
let _appStartMs = Date.now();
const USER_ACTIVITY_UPDATE_CHECK_MS = 5 * 60 * 1000;
/** Periyodik arka plan kontrolü — açık kalan kasalar yeni sürümü yakalasın. */
const UPDATER_PERIODIC_MS = 45 * 60 * 1000;
const UPDATER_INITIAL_DELAYS_MS = [4000, 30000, 120000];
/** `checkForUpdatesAndNotify` Windows'ta İngilizce yerel bildirim açar; yalnız `checkForUpdates` + olaylar → renderer Türkçe UI. */

function notifyUpdaterErrorToRenderer(err) {
  const manualWindow =
    _manualUpdateCheckInFlight || Date.now() < _manualUpdateCheckUntil;
  const earlySession = Date.now() - _appStartMs < 15 * 60 * 1000;
  if (!manualWindow && !(earlySession && !_autoUpdaterErrorSent)) return;
  if (!manualWindow) _autoUpdaterErrorSent = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-error', {
      message: friendlyUpdateError(err),
    });
  }
}

function triggerUpdaterCheck(reason) {
  if (!autoUpdater || process.env.NODE_ENV === 'development') return;
  _lastUserActivityUpdateCheckAt = Date.now();
  autoUpdater.checkForUpdates().catch((err) => {
    paLog('warn', `[updater] kontrol basarisiz (${reason})`, {
      message: err?.message || String(err),
    });
    notifyUpdaterErrorToRenderer(err);
  });
}

function startUpdaterPeriodicIfNeeded() {
  if (_updaterPeriodicStarted || !autoUpdater || process.env.NODE_ENV === 'development') return;
  _updaterPeriodicStarted = true;
  _updaterPeriodicHandle = setInterval(() => {
    triggerUpdaterCheck('periodic');
  }, UPDATER_PERIODIC_MS);
}

function scheduleInitialUpdaterChecks() {
  if (!autoUpdater || process.env.NODE_ENV === 'development') return;
  if (_initialUpdaterChecksScheduled) return;
  _initialUpdaterChecksScheduled = true;
  startUpdaterPeriodicIfNeeded();
  for (const ms of UPDATER_INITIAL_DELAYS_MS) {
    setTimeout(() => triggerUpdaterCheck(`initial-${ms}`), ms);
  }
}

function maybeCheckUpdatesOnUserActivity() {
  if (!autoUpdater || process.env.NODE_ENV === 'development') return;
  const now = Date.now();
  if (now - _lastUserActivityUpdateCheckAt < USER_ACTIVITY_UPDATE_CHECK_MS) return;
  triggerUpdaterCheck('focus');
}

/**
 * `update-available/-downloaded` event'lerinde renderer'a release notes da
 * göndermek için kullanılan yardımcı. electron-updater notları string veya
 * `[{note: '...'}]` dizisi olarak verebilir; her ikisini tek metne dönüştürür.
 */
function normalizeReleaseNotes(raw) {
  try {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      return raw
        .map((entry) => (entry && typeof entry === 'object' ? entry.note || '' : String(entry || '')))
        .filter((t) => t && String(t).trim().length > 0)
        .join('\n\n');
    }
    if (typeof raw === 'object' && raw.note) return String(raw.note);
    return String(raw);
  } catch (_) {
    return '';
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  if (process.env.NODE_ENV === 'development') return;

  // İndirme otomatik başlasın; "yükle" anı kullanıcıya bırakılsın.
  // Kullanıcı oturum açıkken modal ile soracağız (renderer tarafında).
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // electron-updater varsayılan olarak pre-release etiketli sürümleri çekmez;
  // production ortamında stable kanalı kullanmak için açıkça false bırakılır.
  autoUpdater.allowPrerelease = false;

  // package.json publish ile aynı kaynak; gömülü app-update.yml saparsa bile doğru repo.
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'sefposbulut',
      repo: 'sefpos-releases',
      releaseType: 'release',
    });
  } catch (e) {
    paLog('warn', '[updater] setFeedURL atlanıyor', { message: e?.message || String(e) });
  }

  autoUpdater.on('checking-for-update', () => {
    paLog('info', '[updater] Güncelleme kontrol ediliyor...');
  });

  autoUpdater.on('update-available', (info) => {
    paLog('info', '[updater] Güncelleme mevcut', { version: info?.version });
    const payload = {
      version: info?.version || '',
      releaseDate: info?.releaseDate || null,
      releaseName: info?.releaseName || '',
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    };
    _pendingUpdateAvailablePayload = payload;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', payload);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    paLog('info', '[updater] Uygulama güncel.', { version: info?.version });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', { version: info?.version || '' });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    paLog('info', '[updater] Güncelleme indirildi', { version: info?.version });
    const payload = {
      version: info?.version || '',
      releaseDate: info?.releaseDate || null,
      releaseName: info?.releaseName || '',
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    };
    _pendingUpdateDownloadedPayload = payload;
    _pendingUpdateAvailablePayload = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', payload);
    }
  });

  autoUpdater.on('error', (err) => {
    paLog('error', '[updater] Güncelleme hatası', { message: err?.message });
    notifyUpdaterErrorToRenderer(err);
  });

  // Arayüz hazır olmazsa yedek: ~45 sn sonra ilk kontrol planı.
  setTimeout(() => {
    scheduleInitialUpdaterChecks();
  }, 45 * 1000);
}

let bcryptjs = null;
let pgModule = null;

function getBcrypt() {
  if (!bcryptjs) {
    const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
    const resourcesPath = process.resourcesPath || path.join(appPath, '..');
    const candidates = [
      path.join(appPath, 'node_modules', 'bcryptjs'),
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'bcryptjs'),
      path.join(__dirname, '..', 'node_modules', 'bcryptjs'),
      'bcryptjs',
    ];
    for (const p of candidates) {
      try { bcryptjs = require(p); if (bcryptjs) break; } catch {}
    }
  }
  return bcryptjs;
}

function getPg() {
  if (!pgModule) {
    const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
    const resourcesPath = process.resourcesPath || path.join(appPath, '..');
    const candidates = [
      path.join(appPath, 'node_modules', 'pg'),
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'pg'),
      path.join(__dirname, '..', 'node_modules', 'pg'),
      'pg',
    ];
    for (const p of candidates) {
      try { pgModule = require(p); if (pgModule) break; } catch {}
    }
  }
  return pgModule;
}

function normalizePgConfig(cfg) {
  return {
    host: (cfg?.host || 'localhost').trim(),
    port: Number(cfg?.port || 5432),
    database: (cfg?.database || 'sefpos45').trim(),
    user: (cfg?.username || cfg?.user || 'postgres').trim(),
    password: String(cfg?.password || ''),
  };
}

async function pgConnect(cfg, dbOverride) {
  const pg = getPg();
  if (!pg?.Client) throw new Error('pg paketi yuklenemedi. Uygulamayi yeniden yukleyin.');
  const normalized = normalizePgConfig(cfg);
  const client = new pg.Client({
    host: normalized.host,
    port: normalized.port,
    database: dbOverride || normalized.database,
    user: normalized.user,
    password: normalized.password,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  await client.connect();
  return client;
}

function getTedious() {
  const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
  const resourcesPath = process.resourcesPath || path.join(appPath, '..');
  const candidates = [
    path.join(appPath, 'node_modules', 'tedious'),
    path.join(appPath, '..', 'node_modules', 'tedious'),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'tedious'),
    path.join(__dirname, '..', 'node_modules', 'tedious'),
    'tedious',
  ];
  for (const p of candidates) {
    try { const m = require(p); if (m) return m; } catch {}
  }
  return null;
}

function getMssql() {
  const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
  const resourcesPath = process.resourcesPath || path.join(appPath, '..');
  const candidates = [
    path.join(appPath, 'node_modules', 'mssql'),
    path.join(appPath, '..', 'node_modules', 'mssql'),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'mssql'),
    path.join(__dirname, '..', 'node_modules', 'mssql'),
    'mssql',
  ];
  for (const p of candidates) {
    try { const m = require(p); if (m) return m; } catch {}
  }
  return null;
}

/** İsimli örnek (.\sqlexpressayka) için SQL Browser yerine doğrudan TCP portu (Windows kayıt defteri). */
function resolveNamedInstanceTcpPort(instanceName) {
  if (process.platform !== 'win32' || !instanceName) return null;
  const inst = String(instanceName).trim();
  if (!inst) return null;
  try {
    const namesOut = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL"',
      { encoding: 'utf8', windowsHide: true, timeout: 8000 },
    );
    const esc = inst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp(`^\\s*${esc}\\s+REG_SZ\\s+(\\S+)`, 'im');
    const nameMatch = namesOut.match(nameRe);
    if (!nameMatch) return null;
    const regKey = nameMatch[1];
    const tcpOut = execSync(
      `reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${regKey}\\MSSQLServer\\SuperSocketNetLib\\Tcp\\IPAll"`,
      { encoding: 'utf8', windowsHide: true, timeout: 8000 },
    );
    let m = tcpOut.match(/TcpDynamicPorts\s+REG_SZ\s+(\d+)/i);
    if (m && m[1] && m[1] !== '0') return parseInt(m[1], 10);
    m = tcpOut.match(/TcpPort\s+REG_SZ\s+(\d+)/i);
    if (m && m[1]) return parseInt(m[1], 10);
  } catch { /* ignore */ }
  return null;
}

function formatSqlResolvedHost(cfg, dbName) {
  const tc = buildTediousConfig(cfg, dbName);
  let label = tc.server;
  if (tc.options.instanceName) label += '\\' + tc.options.instanceName;
  else if (tc.options.port) label += ':' + tc.options.port;
  return label;
}

function buildMssqlConfig(cfg, dbName) {
  const norm = normalizeSqlServerConfig(cfg);
  const tc = buildTediousConfig(cfg, dbName);
  const config = {
    server: tc.server,
    database: dbName || norm.database,
    user: norm.username || 'sa',
    password: norm.password ?? '',
    options: {
      encrypt: norm.encrypt === true,
      trustServerCertificate: norm.trustServerCertificate !== false,
      enableArithAbort: true,
      connectTimeout: 12000,
      requestTimeout: 120000,
    },
    pool: { max: 8, min: 0, idleTimeoutMillis: 30000 },
  };
  if (tc.options.instanceName && !tc.options.port) {
    config.options.instanceName = tc.options.instanceName;
  } else if (tc.options.port) {
    config.options.port = tc.options.port;
  }
  return config;
}

function tediousTypeToMssql(sql, tediousType) {
  if (!tediousType || !sql) return sql?.NVarChar;
  const name = tediousType?.name || String(tediousType);
  if (/UniqueIdentifier/i.test(name)) return sql.UniqueIdentifier;
  if (/DateTime/i.test(name)) return sql.DateTime2;
  if (/Bit/i.test(name)) return sql.Bit;
  if (/BigInt/i.test(name)) return sql.BigInt;
  if (/Int/i.test(name)) return sql.Int;
  if (/Float|Real/i.test(name)) return sql.Float;
  if (/Decimal|Numeric/i.test(name)) return sql.Decimal(18, 4);
  return sql.NVarChar;
}

/** mssql-only ortamda tedious TYPES yok; param tipleri icin ortak yardimci. */
function getSqlParamTypes() {
  const tedious = getTedious();
  if (tedious?.TYPES) return tedious.TYPES;
  return {
    NVarChar: { name: 'NVarChar' },
    UniqueIdentifier: { name: 'UniqueIdentifier' },
    DateTime2: { name: 'DateTime2' },
    Int: { name: 'Int' },
    Bit: { name: 'Bit' },
  };
}

function hasSqlDriver() {
  return !!(getMssql() || getTedious());
}

const DEFAULT_SQL_ADMIN_EMAIL = 'admin@shefpos.local';
const DEFAULT_SQL_ADMIN_PASSWORD = '1234';

/** Kurulum sonrasi varsayilan ADMIN kullanicisini olusturur veya sifreyi dogrular. */
async function ensureDefaultAdminUser(cfg, dbName, { resetPassword = true } = {}) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs paketi yuklenemedi');
  if (!hasSqlDriver()) throw new Error('SQL baglanti kutuphanesi yuklenemedi');
  const TYPES = getSqlParamTypes();
  const norm = cfg || loadSettings().sqlServerConfig;
  if (!norm) throw new Error('SQL Server yapilandirmasi yok');
  const targetDb = dbName || norm.database || 'sefpos45';
  const hash = await bcrypt.hash(DEFAULT_SQL_ADMIN_PASSWORD, 10);

  const existing = await runSql(
    `SELECT u.id AS user_id, u.email, u.password_hash, p.id AS profile_id, p.tenant_id
     FROM app_users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.email = @email OR LOWER(p.full_name) IN ('admin', N'ADMIN')`,
    { email: { type: TYPES.NVarChar, value: DEFAULT_SQL_ADMIN_EMAIL } },
    norm,
    targetDb,
  );
  let row = existing && existing[0];

  if (!row?.user_id) {
    const fallback = await runSql(
      `SELECT TOP 1 u.id AS user_id, u.email, u.password_hash, p.id AS profile_id, p.tenant_id
       FROM app_users u
       INNER JOIN profiles p ON p.id = u.id
       WHERE p.role IN (N'owner', N'admin')
       ORDER BY u.created_at`,
      {},
      norm,
      targetDb,
    );
    row = fallback?.[0] || row;
  }

  if (!row?.user_id) {
    const tenantExists = await runSql(
      `SELECT TOP 1 id FROM tenants WHERE slug = @slug`,
      { slug: { type: TYPES.NVarChar, value: 'varsayilan-isletme' } },
      norm,
      targetDb,
    );
    if (tenantExists?.[0]?.id) {
      throw new Error('SQL isletmesi mevcut ancak yonetici kullanicisi bulunamadi. Veritabani kurulumunu tekrarlayin.');
    }
    await runSql(
      `EXEC sp_create_tenant_and_user
         @email=@email,
         @password_hash=@password_hash,
         @full_name=@full_name,
         @tenant_name=@tenant_name,
         @tenant_slug=@tenant_slug`,
      {
        email: { type: TYPES.NVarChar, value: DEFAULT_SQL_ADMIN_EMAIL },
        password_hash: { type: TYPES.NVarChar, value: hash },
        full_name: { type: TYPES.NVarChar, value: 'ADMIN' },
        tenant_name: { type: TYPES.NVarChar, value: 'Varsayilan Isletme' },
        tenant_slug: { type: TYPES.NVarChar, value: 'varsayilan-isletme' },
      },
      norm,
      targetDb,
    );
    return { created: true, email: DEFAULT_SQL_ADMIN_EMAIL };
  }

  if (resetPassword) {
    await runSql(
      `UPDATE app_users SET password_hash = @password_hash WHERE id = @uid`,
      {
        uid: { type: TYPES.UniqueIdentifier, value: row.user_id },
        password_hash: { type: TYPES.NVarChar, value: hash },
      },
      norm,
      targetDb,
    );
  }

  if (!row.profile_id && row.tenant_id) {
    await runSql(
      `UPDATE profiles SET full_name = N'ADMIN' WHERE id = @uid`,
      { uid: { type: TYPES.UniqueIdentifier, value: row.user_id } },
      norm,
      targetDb,
    ).catch(() => {});
  } else if (!row.profile_id && !row.tenant_id) {
    const tenantExists = await runSql(
      `SELECT TOP 1 id FROM tenants WHERE slug = @slug`,
      { slug: { type: TYPES.NVarChar, value: 'varsayilan-isletme' } },
      norm,
      targetDb,
    );
    if (tenantExists?.[0]?.id) {
      throw new Error('SQL isletmesi mevcut ancak kullanici profili eksik. Veritabani kurulumunu tekrarlayin.');
    }
    await runSql(
      `EXEC sp_create_tenant_and_user
         @email=@email,
         @password_hash=@password_hash,
         @full_name=@full_name,
         @tenant_name=@tenant_name,
         @tenant_slug=@tenant_slug`,
      {
        email: { type: TYPES.NVarChar, value: row.email || DEFAULT_SQL_ADMIN_EMAIL },
        password_hash: { type: TYPES.NVarChar, value: hash },
        full_name: { type: TYPES.NVarChar, value: 'ADMIN' },
        tenant_name: { type: TYPES.NVarChar, value: 'Varsayilan Isletme' },
        tenant_slug: { type: TYPES.NVarChar, value: 'varsayilan-isletme' },
      },
      norm,
      targetDb,
    );
  }

  return { created: false, email: row.email || DEFAULT_SQL_ADMIN_EMAIL, resetPassword: !!resetPassword };
}

/** Hibrit: bulut kasa girisi icin SQL admin hesabini bulut e-posta/sifresiyle eslestirir. */
async function syncHybridKasaUserToSql(cfg, dbName, { email, password, sqlTenantId, sqlBranchId, fullName, tenantName }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs paketi yuklenemedi');
  if (!hasSqlDriver()) throw new Error('SQL baglanti kutuphanesi yuklenemedi');
  const TYPES = getSqlParamTypes();
  const norm = cfg || loadSettings().sqlServerConfig;
  const targetDb = dbName || norm?.database || 'sefpos45';
  const loginEmail = String(email || '').trim().toLowerCase();
  if (!loginEmail || !sqlTenantId) throw new Error('E-posta ve SQL tenant zorunlu');
  const hash = await bcrypt.hash(String(password || ''), 10);

  const admins = await runSql(
    `SELECT TOP 1 u.id AS user_id
     FROM app_users u
     INNER JOIN profiles p ON p.id = u.id
     WHERE p.tenant_id = @tenant
     ORDER BY CASE WHEN u.email = @defaultAdmin THEN 0 WHEN p.role IN (N'owner', N'admin') THEN 1 ELSE 2 END, u.created_at`,
    {
      tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
      defaultAdmin: { type: TYPES.NVarChar, value: DEFAULT_SQL_ADMIN_EMAIL },
    },
    norm,
    targetDb,
  );
  const admin = admins?.[0];
  if (!admin?.user_id) throw new Error('SQL kasa kullanicisi bulunamadi');

  await runSql(
    `UPDATE app_users SET email = @email, password_hash = @password_hash WHERE id = @uid`,
    {
      uid: { type: TYPES.UniqueIdentifier, value: admin.user_id },
      email: { type: TYPES.NVarChar, value: loginEmail },
      password_hash: { type: TYPES.NVarChar, value: hash },
    },
    norm,
    targetDb,
  );

  await runSql(
    `UPDATE profiles SET
       full_name = COALESCE(@name, full_name),
       branch_id = COALESCE(@branch, branch_id)
     WHERE id = @uid`,
    {
      uid: { type: TYPES.UniqueIdentifier, value: admin.user_id },
      name: { type: TYPES.NVarChar, value: fullName || null },
      branch: sqlBranchId ? { type: TYPES.UniqueIdentifier, value: sqlBranchId } : { type: TYPES.UniqueIdentifier, value: null },
    },
    norm,
    targetDb,
  ).catch(() => {});

  if (tenantName) {
    await runSql(
      `UPDATE tenants SET name = COALESCE(@tname, name), deployment_mode = N'hybrid' WHERE id = @tenant`,
      {
        tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
        tname: { type: TYPES.NVarChar, value: tenantName },
      },
      norm,
      targetDb,
    ).catch(() => {});
  }

  return { email: loginEmail, userId: admin.user_id };
}

/** Hibrit baglanti: SQL tenant/branch — admin@shefpos.local girisi gerektirmez. */
async function resolveSqlTenantForHybrid(cfg, dbName) {
  const norm = normalizeSqlServerConfig(cfg || loadSettings().sqlServerConfig);
  if (!norm) throw new Error('SQL Server yapilandirmasi yok');
  const targetDb = (dbName || norm.database || 'sefpos45').replace(/[^a-zA-Z0-9_]/g, '') || 'sefpos45';
  const TYPES = getSqlParamTypes();

  const findTenant = async () => runSql(
    `SELECT TOP 1
        t.id AS tenant_id,
        COALESCE(b_main.id, b_any.id) AS branch_id,
        u.email AS admin_email
     FROM tenants t
     INNER JOIN profiles p ON p.tenant_id = t.id
     INNER JOIN app_users u ON u.id = p.id
     OUTER APPLY (
       SELECT TOP 1 id FROM branches bx
       WHERE bx.tenant_id = t.id AND bx.is_main = 1
       ORDER BY bx.created_at
     ) b_main
     OUTER APPLY (
       SELECT TOP 1 id FROM branches bx
       WHERE bx.tenant_id = t.id
       ORDER BY bx.is_main DESC, bx.created_at
     ) b_any
     ORDER BY
       CASE WHEN u.email = @defaultAdmin THEN 0 WHEN p.role IN (N'owner', N'admin') THEN 1 ELSE 2 END,
       t.created_at`,
    { defaultAdmin: { type: TYPES.NVarChar, value: DEFAULT_SQL_ADMIN_EMAIL } },
    norm,
    targetDb,
  );

  let rows = await findTenant();
  let row = rows?.[0];
  if (!row?.tenant_id) {
    await ensureDefaultAdminUser(norm, targetDb, { resetPassword: false });
    rows = await findTenant();
    row = rows?.[0];
  }
  if (!row?.tenant_id) {
    throw new Error('SQL isletmesi bulunamadi — once «Test Et + Kur ve Basla» adimini tamamlayin');
  }
  return {
    sqlTenantId: row.tenant_id,
    sqlBranchId: row.branch_id || null,
    adminEmail: row.admin_email || DEFAULT_SQL_ADMIN_EMAIL,
  };
}

async function performSqlLoginByEmail(email, password) {
  const bcrypt = getBcrypt();
  if (!bcrypt) return { success: false, error: 'bcryptjs paketi yuklenemedi' };
  if (!hasSqlDriver()) return { success: false, error: 'SQL baglanti kutuphanesi yuklenemedi' };
  const TYPES = getSqlParamTypes();
  const loginEmail = String(email || '').trim().toLowerCase();
  const rows = await runSql(
    `EXEC sp_get_user_by_email @email`,
    { email: { type: TYPES.NVarChar, value: loginEmail } },
  );
  const row = rows && rows[0];
  if (!row) return { success: false, error: 'Kullanici bulunamadi: ' + loginEmail };
  if (!row.password_hash) return { success: false, error: 'Sifre hash bulunamadi - veritabanini yeniden kurun' };
  const passwordMatch = await bcrypt.compare(String(password), String(row.password_hash));
  if (!passwordMatch) return { success: false, error: 'Sifre hatali' };
  const userRecord = {
    user_id: row.user_id,
    email: row.email,
    profile_id: row.profile_id,
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    role_id: row.role_id,
    full_name: row.full_name,
    role: row.role,
    is_super_admin: row.is_super_admin === true || row.is_super_admin === 1,
    onboarding_completed: row.onboarding_completed === true || row.onboarding_completed === 1,
    allowed_ips: row.allowed_ips,
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    tenant_address: row.tenant_address || null,
    tenant_phone: row.tenant_phone || null,
    subscription_plan: row.subscription_plan || 'professional',
    subscription_expires_at: row.subscription_expires_at || null,
    subscription_status: row.subscription_status,
    deployment_mode: row.deployment_mode,
    lock_pin: row.lock_pin,
    require_cancel_reason: row.require_cancel_reason === true || row.require_cancel_reason === 1,
    tenant_onboarding: row.tenant_onboarding === true || row.tenant_onboarding === 1,
    printer_settings: row.printer_settings,
    branch_name: row.branch_name,
    branch_is_main: row.branch_is_main === true || row.branch_is_main === 1,
    role_permissions: parseSqlRolePermissions(row.role_permissions) || DEFAULT_PERMISSIONS,
  };
  return { success: true, data: userRecord };
}

async function verifyDefaultAdminLogin(cfg, dbName) {
  const bcrypt = getBcrypt();
  if (!bcrypt || !hasSqlDriver()) {
    return { ok: false, error: 'SQL veya bcrypt kutuphanesi yuklenemedi' };
  }
  const TYPES = getSqlParamTypes();
  const rows = await runSql(
    `EXEC sp_get_user_by_email @email`,
    { email: { type: TYPES.NVarChar, value: DEFAULT_SQL_ADMIN_EMAIL } },
    cfg,
    dbName,
  );
  const row = rows && rows[0];
  if (!row?.password_hash) {
    return { ok: false, error: 'ADMIN kullanicisi bulunamadi — kurulumu tekrarlayin' };
  }
  const match = await bcrypt.compare(DEFAULT_SQL_ADMIN_PASSWORD, String(row.password_hash));
  if (!match) {
    return { ok: false, error: 'ADMIN sifresi 1234 ile eslesmiyor' };
  }
  return { ok: true, email: DEFAULT_SQL_ADMIN_EMAIL };
}

let mssqlPool = null;
let mssqlPoolKey = null;

async function closeMssqlPool() {
  if (mssqlPool) {
    try { await mssqlPool.close(); } catch {}
    mssqlPool = null;
    mssqlPoolKey = null;
  }
}

/** Tek sorguda connect/close yapmak kasayı kilitler — havuz paylaşılır. */
async function getMssqlPool(cfg, dbName) {
  const sql = getMssql();
  if (!sql) throw new Error('mssql paketi yuklenemedi. Uygulamayi yeniden yukleyin.');
  const config = buildMssqlConfig(cfg, dbName);
  const key = JSON.stringify(config);
  if (mssqlPool && mssqlPoolKey === key) {
    return mssqlPool;
  }
  await closeMssqlPool();
  const pool = new sql.ConnectionPool(config);
  pool.on('error', () => {
    closeMssqlPool();
  });
  mssqlPool = await pool.connect();
  mssqlPoolKey = key;
  return mssqlPool;
}

async function mssqlConnect(cfg, dbName) {
  return getMssqlPool(cfg, dbName);
}

/** Kurulum / test — paylaşılan havuzu kapatmaz. */
async function mssqlConnectOnce(cfg, dbName) {
  const sql = getMssql();
  if (!sql) throw new Error('mssql paketi yuklenemedi. Uygulamayi yeniden yukleyin.');
  const config = buildMssqlConfig(cfg, dbName);
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  return pool;
}

async function mssqlQuery(pool, sqlText, params) {
  const sql = getMssql();
  const req = pool.request();
  if (params && sql) {
    for (const [name, { type, value }] of Object.entries(params)) {
      req.input(name, tediousTypeToMssql(sql, type), value);
    }
  }
  const result = await req.query(sqlText);
  return result.recordset || [];
}

async function mssqlTestConnection(norm) {
  const pool = await mssqlConnectOnce(norm, 'master');
  try {
    const rows = await mssqlQuery(pool, 'SELECT @@VERSION AS ver', null);
    return { rows, resolvedHost: formatSqlResolvedHost(norm, 'master') };
  } finally {
    try { await pool.close(); } catch {}
  }
}

function normalizeSqlServerConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('SQL Server ayarlari bos');
  }
  let host = String(cfg.host || 'localhost').trim();
  host = host.replace(/\//g, '\\');
  if (/^\(local\)$/i.test(host) || host === '.') host = '.';
  return {
    host,
    port: String(cfg.port ?? '').trim(),
    database: String(cfg.database || 'sefpos45').trim() || 'sefpos45',
    username: String(cfg.username || 'sa').trim(),
    password: String(cfg.password ?? ''),
    encrypt: cfg.encrypt === true,
    trustServerCertificate: cfg.trustServerCertificate !== false,
    instanceName: cfg.instanceName,
  };
}

function buildTediousConfig(cfg, dbName) {
  const norm = normalizeSqlServerConfig(cfg);
  const rawHost = norm.host;
  let server = rawHost;
  let instanceName = norm.instanceName || undefined;

  const backslashIdx = rawHost.indexOf('\\');
  if (backslashIdx !== -1) {
    const left = rawHost.substring(0, backslashIdx).trim();
    const right = rawHost.substring(backslashIdx + 1).trim();
    server = (left === '.' || left === '' || left === '(local)') ? 'localhost' : left;
    if (right) instanceName = right;
  }

  const portRaw = String(norm.port || '').trim();
  let portNum = portRaw ? parseInt(portRaw, 10) : undefined;
  let useInstanceName = instanceName || undefined;

  if (instanceName && !portRaw) {
    const resolvedPort = resolveNamedInstanceTcpPort(instanceName);
    if (Number.isFinite(resolvedPort) && resolvedPort > 0) {
      portNum = resolvedPort;
      useInstanceName = undefined;
    }
  }

  return {
    server,
    authentication: {
      type: 'default',
      options: {
        userName: norm.username || 'sa',
        password: norm.password || '',
      },
    },
    options: {
      port: useInstanceName ? undefined : (Number.isFinite(portNum) ? portNum : 1433),
      instanceName: useInstanceName,
      database: dbName || norm.database || 'sefpos45',
      encrypt: norm.encrypt === true,
      trustServerCertificate: norm.trustServerCertificate !== false,
      enableArithAbort: true,
      connectTimeout: 12000,
      requestTimeout: 60000,
      rowCollectionOnDone: true,
      useColumnNames: true,
    },
  };
}

function tediousConnect(cfg, dbName) {
  return new Promise((resolve, reject) => {
    const tedious = getTedious();
    if (!tedious) return reject(new Error('tedious paketi yuklenemedi. Uygulamayi yeniden yukleyin.'));
    const config = buildTediousConfig(cfg, dbName);
    const conn = new tedious.Connection(config);
    let settled = false;
    const finish = (fn) => (arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    const ms = config.options.connectTimeout || 12000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.close(); } catch { /* ignore */ }
      reject(
        new Error(
          `Baglanti zaman asimi (${Math.round(ms / 1000)} sn). Sunucu: ${config.server}` +
            (config.options.instanceName ? `\\${config.options.instanceName}` : '') +
            ' — SQL Browser acik mi? Encrypt kapali mi? SA sifresi dogru mu?',
        ),
      );
    }, ms + 3000);
    conn.on('connect', finish((err) => {
      if (err) return reject(err);
      resolve(conn);
    }));
    conn.on('error', finish((err) => reject(err)));
    conn.connect();
  });
}

function tediousQuery(conn, sql, params) {
  return new Promise((resolve, reject) => {
    const tedious = getTedious();
    const rows = [];
    const req = new tedious.Request(sql, (err, rowCount) => {
      if (err) return reject(err);
      resolve(rows);
    });
    if (params) {
      for (const [name, { type, value }] of Object.entries(params)) {
        req.addParameter(name, type, value);
      }
    }
    req.on('row', (cols) => {
      const row = {};
      for (const col of Object.values(cols)) {
        let v = col.value;
        if (typeof v === 'string' && (v.toLowerCase() === 'null' || v.toLowerCase() === 'undefined')) {
          v = null;
        }
        row[col.metadata.colName] = v;
      }
      rows.push(row);
    });
    conn.execSql(req);
  });
}

function tediousClose(conn) {
  try { conn.close(); } catch {}
}

let currentSqlConn = null;
let currentSqlCfg = null;

async function getSqlConn(config) {
  const settings = loadSettings();
  const cfg = config || settings.sqlServerConfig;
  if (!cfg) throw new Error('SQL Server yapılandırması bulunamadı');
  if (currentSqlConn && currentSqlCfg === JSON.stringify(cfg)) {
    return currentSqlConn;
  }
  if (currentSqlConn) { tediousClose(currentSqlConn); currentSqlConn = null; }
  currentSqlConn = await tediousConnect(cfg, cfg.database || 'sefpos45');
  currentSqlCfg = JSON.stringify(cfg);
  currentSqlConn.on('error', () => { currentSqlConn = null; currentSqlCfg = null; });
  return currentSqlConn;
}

function closeSqlPool() {
  if (currentSqlConn) { tediousClose(currentSqlConn); currentSqlConn = null; currentSqlCfg = null; }
  closeMssqlPool();
}

async function runSql(sqlText, params, config, dbName) {
  const settings = loadSettings();
  const cfg = config || settings.sqlServerConfig;
  if (!cfg) throw new Error('SQL Server yapılandırması bulunamadı');
  const targetDb = dbName || cfg.database || 'sefpos45';

  if (getMssql()) {
    const pool = await getMssqlPool(cfg, targetDb);
    return await mssqlQuery(pool, sqlText, params);
  }

  const tedious = getTedious();
  if (!tedious) throw new Error('SQL baglanti kutuphanesi yuklenemedi');
  const conn = await tediousConnect(cfg, targetDb);
  try {
    return await tediousQuery(conn, sqlText, params);
  } finally {
    tediousClose(conn);
  }
}

function parseSelectWithJoins(selectStr) {
  if (!selectStr || selectStr.trim() === '*') {
    return { mainCols: '*', joins: [] };
  }

  const joins = [];
  let mainCols = [];
  const cleaned = selectStr.replace(/\s+/g, ' ').trim();

  const parseLevel = (str) => {
    const parts = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') { depth++; current += ch; }
      else if (ch === ')') { depth--; current += ch; }
      else if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };

  const parts = parseLevel(cleaned);

  for (const part of parts) {
    const parenIdx = part.indexOf('(');
    if (parenIdx === -1) {
      if (part.trim() === '*' || part.trim() === '') {
        mainCols.push('*');
      } else {
        mainCols.push(part.trim().replace(/[^a-zA-Z0-9_]/g, ''));
      }
    } else {
      let relName = part.substring(0, parenIdx).trim();
      const exclamIdx = relName.indexOf('!');
      if (exclamIdx !== -1) relName = relName.substring(0, exclamIdx);
      relName = relName.replace(/[^a-zA-Z0-9_]/g, '');

      const inner = part.substring(parenIdx + 1, part.length - 1).trim();
      const innerParts = parseLevel(inner);
      const relCols = innerParts.flatMap(ip => {
        const pi = ip.indexOf('(');
        if (pi === -1) {
          if (ip.trim() === '*') return ['*'];
          return [ip.trim().replace(/[^a-zA-Z0-9_]/g, '')];
        }
        return ['*'];
      }).filter(Boolean);

      joins.push({ table: relName, cols: relCols.length > 0 ? relCols : ['*'] });
    }
  }

  const hasWildcard = mainCols.includes('*');
  return {
    mainCols: hasWildcard ? '*' : (mainCols.filter(Boolean).join(', ') || '*'),
    joins,
  };
}

const JOIN_FK_MAP = {
  order_items: [
    { childTable: 'products', fk: 'product_id', pk: 'id' },
  ],
  restaurant_tables: [
    { childTable: 'orders', fk: 'current_order_id', pk: 'id' },
  ],
  table_groups: [
    { childTable: 'branches', fk: 'branch_id', pk: 'id' },
  ],
  restaurant_tables_to_table_groups: [
    { parentTable: 'table_groups', fk: 'group_id', pk: 'id' },
  ],
  cash_register_transactions: [
    { childTable: 'profiles', fk: 'user_id', pk: 'id' },
  ],
  order_items: [
    { childTable: 'products', fk: 'product_id', pk: 'id' },
  ],
  orders: [
    { childTable: 'order_items', fk: 'order_id', pk: 'id' },
  ],
};

function getFkForJoin(mainTable, joinTable) {
  const maps = JOIN_FK_MAP[mainTable] || [];
  for (const m of maps) {
    if (m.childTable === joinTable) return { fk: m.fk, pk: m.pk, direction: 'child' };
    if (m.parentTable === joinTable) return { fk: m.fk, pk: m.pk, direction: 'parent' };
  }
  if (joinTable === 'table_groups' && mainTable === 'restaurant_tables') {
    return { fk: 'group_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'branches' && mainTable === 'table_groups') {
    return { fk: 'branch_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'categories' && mainTable === 'products') {
    return { fk: 'category_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'products' && mainTable === 'order_items') {
    return { fk: 'product_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'order_items' && mainTable === 'orders') {
    return { fk: 'order_id', pk: 'id', direction: 'child' };
  }
  if (joinTable === 'orders' && mainTable === 'restaurant_tables') {
    return { fk: 'current_order_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'profiles' && mainTable === 'cash_register_transactions') {
    return { fk: 'user_id', pk: 'id', direction: 'parent' };
  }
  return null;
}

async function execSelectWithJoins(table, select, filters, orderBy, limitVal, cfg) {
  const safeId = (c) => c.replace(/[^a-zA-Z0-9_]/g, '');
  const { mainCols, joins } = parseSelectWithJoins(select);

  const prefixedFilters = (filters || []).map(f => {
    if (!f.col) return f;
    if (f.op === 'or' && Array.isArray(f.val)) {
      return { ...f, val: f.val.map(sub => sub.col ? { ...sub, col: `t.${safeId(sub.col)}` } : sub) };
    }
    return { ...f, col: `t.${safeId(f.col)}` };
  });
  const params = {};
  const where = buildWhereTedious(prefixedFilters, params, 'w');
  const top = limitVal ? `TOP ${parseInt(limitVal, 10)}` : '';
  const order = orderBy && orderBy.length > 0
    ? `ORDER BY ${orderBy.map(o => `t.${safeId(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`
    : '';

  if (joins.length === 0) {
    const cols = mainCols === '*' ? '*' : mainCols;
    const parts = ['SELECT', top, cols, 'FROM', safeId(table), where, order].filter(Boolean);
    return runSql(parts.join(' '), params, cfg);
  }

  const mainColStr = mainCols === '*' ? `t.*` : mainCols.split(',').map(c => `t.${c.trim()}`).join(', ');
  const joinClauses = [];
  const joinSelectParts = [mainColStr];

  for (const j of joins) {
    const rel = getFkForJoin(table, j.table);
    if (!rel) continue;

    const alias = `j_${j.table}`;
    if (rel.direction === 'parent') {
      joinClauses.push(`LEFT JOIN ${safeId(j.table)} ${alias} ON t.${safeId(rel.fk)} = ${alias}.${safeId(rel.pk)}`);
    } else {
      joinClauses.push(`LEFT JOIN ${safeId(j.table)} ${alias} ON ${alias}.${safeId(rel.fk)} = t.${safeId(rel.pk)}`);
    }

    const hasStar = j.cols.includes('*');
    const jCols = hasStar
      ? `${alias}.*`
      : j.cols.filter(Boolean).map(c => `${alias}.${safeId(c)} AS [${j.table}__${safeId(c)}]`).join(', ');
    if (jCols) joinSelectParts.push(jCols);

    const rel2 = getFkForJoin(j.table, 'categories');
    if (rel2) {
      const alias2 = `j_${j.table}_cat`;
      joinClauses.push(
        `LEFT JOIN categories ${alias2} ON ${alias}.${safeId(rel2.fk)} = ${alias2}.${safeId(rel2.pk)}`,
      );
      for (const cf of ['id', 'name', 'vat_rate', 'hugin_department_id', 'color', 'sort_order']) {
        joinSelectParts.push(`${alias2}.${cf} AS [${j.table}__categories__${cf}]`);
      }
    }
  }

  const wherePart = where || '';
  const q = ['SELECT', top, joinSelectParts.join(', '), 'FROM', `${safeId(table)} t`, ...joinClauses, wherePart, order]
    .filter(Boolean).join(' ').trim();

  const rows = await runSql(q, params, cfg);

  if (!rows || rows.length === 0) return rows;

  return rows.map(row => {
    const main = {};
    const nested = {};

    for (const [key, val] of Object.entries(row)) {
      const catNest = key.match(/^(\w+)__categories__(\w+)$/);
      if (catNest) {
        const tbl = catNest[1];
        if (!nested[tbl]) nested[tbl] = {};
        if (!nested[tbl].categories) nested[tbl].categories = {};
        nested[tbl].categories[catNest[2]] = val;
        continue;
      }
      const dblIdx = key.indexOf('__');
      if (dblIdx > -1) {
        const tbl = key.substring(0, dblIdx);
        const col = key.substring(dblIdx + 2);
        if (!nested[tbl]) nested[tbl] = {};
        nested[tbl][col] = val;
      } else {
        main[key] = val;
      }
    }

    for (const [tbl, data] of Object.entries(nested)) {
      const { categories: catSub, ...rest } = data;
      const allNull = Object.values(rest).every((v) => v === null);
      const base = allNull ? {} : rest;
      if (catSub && !Object.values(catSub).every((v) => v === null)) {
        base.categories = catSub;
      }
      const allEmpty = Object.keys(base).length === 0;
      main[tbl] = allEmpty ? null : base;
    }

    return main;
  });
}

function buildWhereTedious(filters, params, prefix) {
  if (!filters || filters.length === 0) return '';
  let pi = Object.keys(params).length;
  const safeId = (c) => {
    const parts = String(c).split('.');
    if (parts.length === 2) return `${parts[0].replace(/[^a-zA-Z0-9_]/g, '')}.${parts[1].replace(/[^a-zA-Z0-9_]/g, '')}`;
    return c.replace(/[^a-zA-Z0-9_]/g, '');
  };
  const addParam = (val) => {
    const tedious = getTedious();
    const name = `${prefix || 'f'}${pi++}`;
    if (val === null || val === undefined) params[name] = { type: tedious.TYPES.NVarChar, value: null };
    else if (typeof val === 'string' && UUID_RE.test(val)) {
      params[name] = { type: tedious.TYPES.UniqueIdentifier, value: val };
      return `@${name}`;
    }
    const dt = parseSqlDateTime(val);
    if (dt) {
      params[name] = { type: tedious.TYPES.DateTime2, value: dt };
      return `@${name}`;
    }
    if (typeof val === 'boolean') params[name] = { type: tedious.TYPES.Bit, value: val ? 1 : 0 };
    else if (typeof val === 'string' && /^(true|false)$/i.test(val)) {
      params[name] = { type: tedious.TYPES.Bit, value: val.toLowerCase() === 'true' ? 1 : 0 };
    }
    else if (typeof val === 'number' && Number.isInteger(val)) params[name] = { type: tedious.TYPES.Int, value: val };
    else if (typeof val === 'number') params[name] = { type: tedious.TYPES.Decimal, value: val };
    else params[name] = { type: tedious.TYPES.NVarChar, value: String(val) };
    return `@${name}`;
  };
  const buildCondition = (f) => {
    if (f.op === 'eq') return `${safeId(f.col)} = ${addParam(f.val)}`;
    if (f.op === 'neq') return `${safeId(f.col)} != ${addParam(f.val)}`;
    if (f.op === 'gt') return `${safeId(f.col)} > ${addParam(f.val)}`;
    if (f.op === 'gte') return `${safeId(f.col)} >= ${addParam(f.val)}`;
    if (f.op === 'lt') return `${safeId(f.col)} < ${addParam(f.val)}`;
    if (f.op === 'lte') return `${safeId(f.col)} <= ${addParam(f.val)}`;
    if (f.op === 'is_null') return `${safeId(f.col)} IS NULL`;
    if (f.op === 'is_not_null') return `${safeId(f.col)} IS NOT NULL`;
    if (f.op === 'like') return `${safeId(f.col)} LIKE ${addParam(f.val)}`;
    if (f.op === 'ilike') return `LOWER(${safeId(f.col)}) LIKE LOWER(${addParam(f.val)})`;
    if (f.op === 'in' && Array.isArray(f.val)) {
      if (f.val.length === 0) return '1=0';
      return `${safeId(f.col)} IN (${f.val.map(v => addParam(v)).join(', ')})`;
    }
    if (f.op === 'not_in' && Array.isArray(f.val)) {
      if (f.val.length === 0) return '1=1';
      return `${safeId(f.col)} NOT IN (${f.val.map(v => addParam(v)).join(', ')})`;
    }
    if (f.op === 'or' && Array.isArray(f.val)) {
      const orParts = f.val.map(buildCondition).filter(Boolean);
      return orParts.length > 0 ? `(${orParts.join(' OR ')})` : '1=1';
    }
    return '1=1';
  };
  const parts = filters.map(buildCondition);
  return `WHERE ${parts.join(' AND ')}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSqlDateTime(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function addTediousParam(params, name, val) {
  const tedious = getTedious();
  if (val === null || val === undefined) params[name] = { type: tedious.TYPES.NVarChar, value: null };
  else if (typeof val === 'string' && UUID_RE.test(val)) {
    params[name] = { type: tedious.TYPES.UniqueIdentifier, value: val };
  }
  else {
    const dt = parseSqlDateTime(val);
    if (dt) {
      params[name] = { type: tedious.TYPES.DateTime2, value: dt };
      return;
    }
  }
  if (typeof val === 'boolean') params[name] = { type: tedious.TYPES.Bit, value: val ? 1 : 0 };
  else if (typeof val === 'string' && /^(true|false)$/i.test(val)) {
    params[name] = { type: tedious.TYPES.Bit, value: val.toLowerCase() === 'true' ? 1 : 0 };
  }
  else if (typeof val === 'number' && Number.isInteger(val)) params[name] = { type: tedious.TYPES.Int, value: val };
  else if (typeof val === 'number') params[name] = { type: tedious.TYPES.Decimal, value: val };
  else params[name] = { type: tedious.TYPES.NVarChar, value: String(val) };
}

let mainWindow;
let printAgentServer = null;
const PRINT_AGENT_PORT = 7878;

/**
 * Print Agent ile ilgili önemli olayları hem main process stdout'una hem de
 * renderer DevTools Console'una yansıtır. Böylece kullanıcı saha tanısı
 * yaparken Electron'u CMD'den başlatmadan da logları görebilir.
 */
function paLog(level, message, extra) {
  const prefix = '[print-agent]';
  const args = extra !== undefined ? [prefix, message, extra] : [prefix, message];
  if (level === 'error') safeConsoleWrite(console.error, ...args);
  else if (level === 'warn') safeConsoleWrite(console.warn, ...args);
  else safeConsoleWrite(console.log, ...args);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('print-agent-log', {
        level,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        extra: extra === undefined ? null : (typeof extra === 'object' ? extra : String(extra)),
        ts: Date.now(),
      });
    }
  } catch {}
}

/** Vite ile aynı: önce ortam, sonra sefpos-dev-port.json, sonra birincil URL (AGENTS.md). Anon JWT projeye özel — repoda gömülü değil. */
function readSefposDevSupabaseFromJson() {
  try {
    const fp = path.join(__dirname, '..', 'sefpos-dev-port.json');
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const url = String(j.supabaseDevUrl || '')
      .trim()
      .replace(/\/$/, '');
    const anon = String(j.supabaseDevAnonKey || '').trim();
    return { url, anon };
  } catch (_) {}
  return { url: '', anon: '' };
}

const DEFAULT_PRIMARY_SUPABASE_URL = 'https://xdfnozfuuzctubijbnds.supabase.co';
// Public anon key — RLS politikaları ile korunur (AGENTS.md: primary ref
// xdfnozfuuzctubijbnds). Electron production build'de `process.env.VITE_*`
// görünmediği ve `sefpos-dev-port.json` asar paketinin dışında kaldığı için
// son çare olarak bu constant kullanılır. Anon key'i değiştirmek istersen
// VITE_SUPABASE_ANON_KEY env veya sefpos-dev-port.json ile override edebilirsin.
const FALLBACK_PRIMARY_SUPABASE_ANON_KEY = 'sb_publishable_wrSHY5Kzkw-bx0XzYM5VFA_FK3BFF_x';

const _fromPort = readSefposDevSupabaseFromJson();
const SUPABASE_URL =
  String(process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '') || _fromPort.url || DEFAULT_PRIMARY_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  String(process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  || _fromPort.anon
  || FALLBACK_PRIMARY_SUPABASE_ANON_KEY;

if (!app.isPackaged) {
  console.log(`[print-agent] Supabase: url=${SUPABASE_URL}, anonKey=***${SUPABASE_ANON_KEY.slice(-8)}`);
}

const isDev = !app.isPackaged;
/** Üretimde F12 kapalı; destek: SEFPOS_SUPPORT_DEVTOOLS=1 veya Ctrl+Shift+Alt+S */
let supportDevToolsUnlocked = process.env.SEFPOS_SUPPORT_DEVTOOLS === '1';
function productionDevToolsAllowed() {
  return isDev || supportDevToolsUnlocked;
}

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const settingsSecurePath = path.join(app.getPath('userData'), 'settings.secure.json');
const localDbPath = path.join(app.getPath('userData'), 'localdb.json');

function loadLocalDb() {
  try {
    if (fs.existsSync(localDbPath)) {
      return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    }
  } catch {}
  return { tenants: [], branches: [], roles: [], users: [], profiles: [] };
}

function saveLocalDb(db) {
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('LocalDB save error:', e);
  }
}

function localDbEnsureDefaults(db) {
  if (!db.tenants) db.tenants = [];
  if (!db.branches) db.branches = [];
  if (!db.roles) db.roles = [];
  if (!db.users) db.users = [];
  if (!db.profiles) db.profiles = [];
  if (!db.table_groups) db.table_groups = [];
  if (!db.restaurant_tables) db.restaurant_tables = [];
  if (!db.orders) db.orders = [];
  if (!db.order_items) db.order_items = [];
  if (!db.categories) db.categories = [];
  if (!db.products) db.products = [];
  if (!db.cash_register_transactions) db.cash_register_transactions = [];
  if (!db.cancel_logs) db.cancel_logs = [];
  if (!db.couriers) db.couriers = [];
  if (!db.delivery_orders) db.delivery_orders = [];
  return db;
}

const DEFAULT_PERMISSIONS = {
  can_view_tables: true,
  can_take_orders: true,
  can_process_payments: true,
  can_delete_order_items: true,
  can_manage_discounts: true,
  can_manage_products: true,
  can_manage_cash_register: true,
  can_view_reports: true,
  can_end_of_day: true,
  can_view_cancel_logs: true,
  can_manage_users: true,
  can_manage_settings: true,
  can_use_shifts: true,
};

function parseSqlRolePermissions(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function localDbCreateTenantAndUser({ email, password, fullName, tenantName }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const crypto = require('crypto');
  const db = localDbEnsureDefaults(loadLocalDb());

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error('Bu e-posta zaten kayitli');

  const tenantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();

  const slug = (tenantName || 'isletme').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);

  db.tenants.push({
    id: tenantId,
    name: tenantName || 'Isletme',
    slug,
    subscription_status: 'active',
    deployment_mode: 'local',
    onboarding_completed: true,
    created_at: now,
  });

  db.branches.push({
    id: branchId,
    tenant_id: tenantId,
    name: 'Ana Sube',
    is_main: true,
    is_active: true,
    created_at: now,
  });

  db.roles.push({
    id: roleId,
    tenant_id: tenantId,
    name: 'Yonetici',
    permissions: DEFAULT_PERMISSIONS,
    created_at: now,
  });

  const passwordHash = await bcrypt.hash(String(password), 10);

  db.users.push({
    id: userId,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    tenant_id: tenantId,
    created_at: now,
  });

  db.profiles.push({
    id: profileId,
    user_id: userId,
    tenant_id: tenantId,
    branch_id: branchId,
    role_id: roleId,
    role: 'owner',
    full_name: fullName || 'Admin',
    email: email.toLowerCase(),
    onboarding_completed: true,
    created_at: now,
  });

  saveLocalDb(db);
  return { userId, tenantId, branchId, roleId, profileId };
}

async function localDbLogin({ email, password }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const db = localDbEnsureDefaults(loadLocalDb());

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('Kullanici bulunamadi: ' + email);

  const match = await bcrypt.compare(String(password), String(user.password_hash));
  if (!match) throw new Error('Sifre hatali');

  const profile = db.profiles.find(p => p.user_id === user.id);
  if (!profile) throw new Error('Profil bulunamadi');

  const tenant = db.tenants.find(t => t.id === profile.tenant_id);
  const branch = db.branches.find(b => b.id === profile.branch_id);
  const role = db.roles.find(r => r.id === profile.role_id);

  const tenantOnboardingDone = tenant ? (tenant.onboarding_completed === true) : false;

  return {
    user_id: user.id,
    email: user.email,
    profile_id: profile.id,
    tenant_id: profile.tenant_id,
    branch_id: profile.branch_id,
    role_id: profile.role_id,
    full_name: profile.full_name,
    role: profile.role || 'owner',
    is_super_admin: false,
    onboarding_completed: tenantOnboardingDone,
    allowed_ips: null,
    tenant_name: tenant ? tenant.name : 'Isletme',
    tenant_slug: tenant ? tenant.slug : 'isletme',
    subscription_status: tenant ? (tenant.subscription_status || 'active') : 'active',
    deployment_mode: 'local',
    lock_pin: profile.lock_pin || null,
    require_cancel_reason: false,
    tenant_onboarding: tenantOnboardingDone,
    printer_settings: profile.printer_settings || null,
    branch_name: branch ? branch.name : 'Ana Sube',
    branch_is_main: branch ? branch.is_main : true,
    role_permissions: role ? role.permissions : DEFAULT_PERMISSIONS,
  };
}

async function localDbAddUser({ email, password, fullName, tenantId, branchId, roleId, role }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const crypto = require('crypto');
  const db = localDbEnsureDefaults(loadLocalDb());

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error('Bu e-posta zaten kayitli');

  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(String(password), 10);

  db.users.push({ id: userId, email: email.toLowerCase(), password_hash: passwordHash, tenant_id: tenantId, created_at: now });
  db.profiles.push({ id: profileId, user_id: userId, tenant_id: tenantId, branch_id: branchId || null, role_id: roleId || null, role: role || 'waiter', full_name: fullName || email, email: email.toLowerCase(), onboarding_completed: true, created_at: now });

  saveLocalDb(db);
  return { userId, profileId };
}

function localDbGetUsers(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.profiles.filter(p => p.tenant_id === tenantId).map(p => {
    const role = db.roles.find(r => r.id === p.role_id);
    const branch = db.branches.find(b => b.id === p.branch_id);
    return { ...p, roles: role || null, branches: branch || null };
  });
}

function localDbGetRoles(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.roles.filter(r => r.tenant_id === tenantId);
}

function localDbGetBranches(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.branches.filter(b => b.tenant_id === tenantId);
}

function localDbUpdateProfile(profileId, updates) {
  const db = localDbEnsureDefaults(loadLocalDb());
  const idx = db.profiles.findIndex(p => p.id === profileId);
  if (idx >= 0) { db.profiles[idx] = { ...db.profiles[idx], ...updates }; saveLocalDb(db); }
}

async function localDbChangePassword(userId, newPassword) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const db = localDbEnsureDefaults(loadLocalDb());
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx < 0) throw new Error('Kullanici bulunamadi');
  db.users[idx].password_hash = await bcrypt.hash(String(newPassword), 10);
  saveLocalDb(db);
}

function localDbIsEmpty() {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.users.length === 0;
}

function localDbGetTerminalUsers(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  const profiles = tenantId ? db.profiles.filter(p => p.tenant_id === tenantId) : db.profiles;
  return profiles.map(p => ({
    id: p.user_id || p.id,
    username: p.email.split('@')[0],
    full_name: p.full_name,
    role: p.role || 'waiter',
  }));
}

function loadSettings() {
  try {
    const secure = readSecureJson(settingsSecurePath);
    if (secure && typeof secure === 'object') return secure;
    if (fs.existsSync(settingsPath)) {
      const legacy = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      saveSettings(legacy);
      return legacy;
    }
  } catch {}
  return {};
}

function saveSettings(data) {
  try {
    const current = loadSettings();
    const merged = { ...current, ...data };
    writeSecureJson(settingsSecurePath, merged);
    try {
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    } catch {
      /* */
    }
  } catch {}
}

function buildFullHtml(html) {
  const body = String(html || '');
  // Getir / DH partner fişi — kendi genişliği ve stilleri var; .receipt sarmalayıcısı bozmasın.
  if (body.includes('GETİR YEMEK') || body.includes('class="dh-r"') || body.includes("SİPARİŞ DOĞRULAMA KODU")) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 72mm; max-width: 72mm; background: #fff; color: #000; }
  @page { margin: 0; size: 72mm auto; }
  @media print {
    html, body { width: 72mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    width: 72mm;
    max-width: 72mm;
    color: #000;
    background: #fff;
  }
  .receipt {
    width: 72mm;
    max-width: 72mm;
    padding: 0 1mm;
  }
  .center { text-align: center; width: 100%; display: block; }
  .bold { font-weight: bold; }
  .large { font-size: 14px; }
  .xlarge { font-size: 16px; font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 3px 0; width: 100%; }
  .row {
    display: table;
    width: 100%;
    table-layout: fixed;
    margin: 1px 0;
  }
  .row span {
    display: table-cell;
    vertical-align: top;
    overflow: hidden;
    word-break: break-all;
  }
  .row .name { width: 55%; }
  .row .qty { width: 15%; text-align: center; }
  .row .price { width: 30%; text-align: right; }
  .total-row {
    display: table;
    width: 100%;
    table-layout: fixed;
    font-weight: bold;
    margin: 2px 0;
    font-size: 14px;
  }
  .total-row span { display: table-cell; vertical-align: top; }
  .total-row span:last-child { text-align: right; }
  .note { font-size: 10px; padding-left: 4px; font-style: italic; }
  .footer { text-align: center; font-size: 10px; margin-top: 6px; word-break: break-word; }
  @page { margin: 0; size: 72mm auto; }
  @media print {
    html, body { width: 72mm; }
  }
</style>
</head>
<body>
<div class="receipt">
${html}
</div>
</body>
</html>`;
}

async function doPrint(html, printerName, silent) {
  let tmpFile = null;
  try {
    const fullHtml = buildFullHtml(html);
    tmpFile = path.join(os.tmpdir(), `shefpos_print_${Date.now()}.html`);
    fs.writeFileSync(tmpFile, fullHtml, 'utf8');

    const printWin = new BrowserWindow({
      width: 400,
      height: 800,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    try {
      if (typeof printWin.removeMenu === 'function') printWin.removeMenu();
    } catch (_) {}

    printWindows.push(printWin);

    await new Promise((resolve, reject) => {
      printWin.webContents.on('did-finish-load', resolve);
      printWin.webContents.on('did-fail-load', (_, errCode, errDesc) => reject(new Error(errDesc)));
      printWin.loadFile(tmpFile);
    });

    await new Promise(resolve => setTimeout(resolve, 800));

    return new Promise((resolve) => {
      const isPartnerReceipt =
        typeof html === 'string' &&
        (html.includes('GETİR YEMEK') || html.includes('SİPARİŞ DOĞRULAMA KODU') || html.includes('class="dh-r"'));
      const opts = {
        silent: silent !== false,
        printBackground: isPartnerReceipt,
        color: false,
        margins: { marginType: 'none' },
        pageSize: { width: 72000, height: 2000000 },
      };

      if (printerName) opts.deviceName = printerName;

      printWin.webContents.print(opts, (success, errorType) => {
        setTimeout(() => {
          if (!printWin.isDestroyed()) printWin.close();
          printWindows = printWindows.filter(w => w !== printWin);
          if (tmpFile) {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        }, 3000);
        resolve({ success, errorType: errorType || null });
      });
    });
  } catch (err) {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    return { success: false, errorType: err.message };
  }
}

async function getSystemPrinters() {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      description: p.description || '',
      status: p.status,
      isDefault: p.isDefault,
    }));
  } catch {
    return [];
  }
}

function supabaseFetch(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + endpoint);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(options.headers || {}),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data || '[]') });
        } catch {
          resolve({ ok: false, status: res.statusCode, data: null });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function isElectronSqlServerMode() {
  const s = loadSettings();
  return (s.dbMode === 'sqlserver' || s.dbMode === 'hybrid') && !!s.sqlServerConfig;
}

async function updatePrintJobStatus(jobId, status, error) {
  try {
    if (isElectronSqlServerMode()) {
      const cfg = loadSettings().sqlServerConfig;
      const tedious = getTedious();
      const errVal = error !== undefined && error !== null ? String(error).slice(0, 4000) : '';
      await runSql(
        `UPDATE print_jobs SET status = @status, error = @err, updated_at = GETUTCDATE() WHERE id = @id`,
        {
          status: { type: tedious?.TYPES?.NVarChar, value: status },
          err: { type: tedious?.TYPES?.NVarChar, value: errVal },
          id: { type: tedious?.TYPES?.UniqueIdentifier, value: jobId },
        },
        cfg,
      );
      return;
    }
    const body = JSON.stringify({ status, updated_at: new Date().toISOString(), ...(error !== undefined ? { error } : {}) });
    await supabaseFetch(`/rest/v1/print_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      headers: currentUserJwt ? { 'Authorization': `Bearer ${currentUserJwt}` } : {},
      body,
    });
  } catch (err) {
    console.error('Print job durumu güncellenemedi:', err.message);
  }
}

const processingJobIds = new Set();

async function processPrintJob(job) {
  if (processingJobIds.has(job.id)) {
    paLog('log', `Print job zaten işleniyor, atlanıyor: ${job.id}`);
    return;
  }
  processingJobIds.add(job.id);

  paLog('log', `Print job işleniyor: ${job.id}, yazıcı: ${job.printer_name || '(boş — fallback)'}`);

  try {
    if (printJobIsExpired(job)) {
      await updatePrintJobStatus(job.id, 'failed', 'Süresi doldu (otomatik iptal)');
      paLog('warn', `Print job süresi dolmuş, yazdırılmadı: ${job.id}`);
      processingJobIds.delete(job.id);
      return;
    }

    const claimed = await supabaseFetch(
      `/rest/v1/print_jobs?id=eq.${job.id}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation', ...(currentUserJwt ? { 'Authorization': `Bearer ${currentUserJwt}` } : {}) },
        body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() }),
      }
    );

    if (!claimed.ok || !Array.isArray(claimed.data) || claimed.data.length === 0) {
      console.log(`Print job başka süreç tarafından alındı veya zaten işlendi: ${job.id}`);
      processingJobIds.delete(job.id);
      return;
    }

    let targetPrinter = job.printer_name || '';
    if (!targetPrinter.trim()) {
      targetPrinter = pickDefaultKitchenPrinter();
      if (targetPrinter) {
        paLog('log', `printer_name boş, varsayılan mutfak yazıcısı seçildi: ${targetPrinter}`);
      }
    }
    const waitMs = PRINT_MIN_INTERVAL_MS - (Date.now() - lastDoPrintAt);
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    const result = await doPrint(job.html, targetPrinter, true);
    lastDoPrintAt = Date.now();
    if (result.success) {
      await updatePrintJobStatus(job.id, 'done', '');
      paLog('log', `Print job tamamlandı: ${job.id} (yazıcı=${targetPrinter || 'OS varsayılanı'})`);
    } else {
      await updatePrintJobStatus(job.id, 'failed', result.errorType || 'Bilinmeyen hata');
      paLog('error', `Print job başarısız: ${job.id} - ${result.errorType || 'Bilinmeyen hata'}`);
    }
  } catch (err) {
    await updatePrintJobStatus(job.id, 'failed', err.message);
    paLog('error', `Print job hatası: ${job.id} - ${err.message}`);
  } finally {
    processingJobIds.delete(job.id);
  }
}

async function fetchPendingJobsSql() {
  if (!currentTenantId) return;
  const cfg = loadSettings().sqlServerConfig;
  if (!cfg) return;
  const tedious = getTedious();
  const params = {
    tenant_id: { type: tedious?.TYPES?.UniqueIdentifier, value: currentTenantId },
    max_age: { type: tedious?.TYPES?.Int, value: PRINT_JOB_MAX_AGE_MINUTES },
  };
  let branchClause = '(branch_id IS NULL)';
  if (currentBranchId) {
    params.branch_id = { type: tedious?.TYPES?.UniqueIdentifier, value: currentBranchId };
    branchClause = '(branch_id = @branch_id OR branch_id IS NULL)';
  }
  const rows = await runSql(
    `SELECT TOP 8 id, tenant_id, branch_id, html, printer_name, status, error, created_at, updated_at
     FROM print_jobs
     WHERE tenant_id = @tenant_id AND status = N'pending'
       AND ${branchClause}
       AND created_at >= DATEADD(minute, -@max_age, GETUTCDATE())
     ORDER BY created_at ASC`,
    params,
    cfg,
  );
  if (Array.isArray(rows) && rows.length > 0) {
    paLog('log', `fetchPendingJobs(SQL): ${rows.length} bekleyen job.`);
    for (const job of rows) {
      await processPrintJob(job);
    }
  }
}

async function fetchPendingJobs() {
  try {
    if (!currentTenantId) {
      paLog('warn', 'fetchPendingJobs: currentTenantId YOK — register-printers henüz çağrılmadı, polling skip.');
      return;
    }
    if (isElectronSqlServerMode()) {
      await fetchPendingJobsSql();
      return;
    }
    if (!currentUserJwt) {
      paLog('warn', 'fetchPendingJobs: currentUserJwt YOK — RLS polling boş döner. Login sonrası register-printers JWT geçmiş olmalı.');
    }
    const tenantFilter = `&tenant_id=eq.${currentTenantId}`;
    const branchFilter = currentBranchId
      ? `&or=(branch_id.eq.${currentBranchId},branch_id.is.null)`
      : '';
    const headers = currentUserJwt ? { 'Authorization': `Bearer ${currentUserJwt}` } : {};
    const result = await supabaseFetch(
      `/rest/v1/print_jobs?status=eq.pending${tenantFilter}${branchFilter}&order=created_at.asc&limit=8`,
      { headers }
    );
    if (!result.ok) {
      paLog('warn', `fetchPendingJobs HTTP sorunu: status=${result.status}`, result.data);
      return;
    }
    if (Array.isArray(result.data)) {
      if (result.data.length > 0) {
        paLog('log', `fetchPendingJobs: ${result.data.length} bekleyen job çekildi (tenant=${currentTenantId}).`);
      }
      for (const job of result.data) {
        await processPrintJob(job);
      }
    }
  } catch (err) {
    paLog('error', 'Bekleyen print joblar alınamadı: ' + (err?.message || err));
  }
}

let realtimeWs = null;
let realtimeReconnectTimer = null;
let realtimeReconnectAttempts = 0;
const REALTIME_RECONNECT_BASE_MS = 8_000;
const REALTIME_RECONNECT_MAX_MS = 120_000;
let realtimeConnected = false;
let currentTenantId = null;
let currentBranchId = null;
let currentUserJwt = null;
let connectivityLastOnline = null;
let pendingJobsPollTimer = null;
let pendingJobsFetchInFlight = false;
/** Önceki: 1 sn — üst üste binen HTTP/yazdırma tüm Windows'u kilitleyebiliyordu */
const PENDING_JOBS_POLL_MS = 15_000;
/** Realtime bağlıyken yedek poll seyrek (gün boyu açık kasada HTTP birikimini keser) */
const PENDING_JOBS_POLL_REALTIME_MS = 45_000;
const PENDING_JOBS_POLL_SQL_MS = 25_000;
// Son register-printers çağrısındaki kasa yazıcı listesi. processPrintJob
// içinde printer_name boş geldiğinde (mobile/web fallback insertleri)
// mutfak benzeri ilk yazıcıyı seçmek için kullanılır.
let registeredKasaPrinters = [];

/** Bu süreden eski pending job yazdırılmaz (failed). Agent uzun süre kapalıyken biriken kuyruk tek seferde basılmasın. */
const PRINT_JOB_MAX_AGE_MINUTES = 30;
/** İki fiş arası minimum süre — Windows yazıcı kuyruğu/OS tıkanmasın. */
const PRINT_MIN_INTERVAL_MS = 2000;
let lastDoPrintAt = 0;

/**
 * tenant için `created_at` eski olan tüm pending jobları failed yapar (toplu).
 * register-printers sonrası bir kez çağrılır.
 */
async function expireStalePendingJobsForTenant(tenantId, userJwt) {
  if (!tenantId) return;
  if (isElectronSqlServerMode()) {
    try {
      const cfg = loadSettings().sqlServerConfig;
      const tedious = getTedious();
      await runSql(
        `UPDATE print_jobs SET status = N'failed',
           error = N'Suresi doldu (otomatik iptal)',
           updated_at = GETUTCDATE()
         WHERE tenant_id = @tenant_id AND status = N'pending'
           AND created_at < DATEADD(minute, -@mins, GETUTCDATE())`,
        {
          tenant_id: { type: tedious?.TYPES?.UniqueIdentifier, value: tenantId },
          mins: { type: tedious?.TYPES?.Int, value: PRINT_JOB_MAX_AGE_MINUTES },
        },
        cfg,
      );
      paLog('log', 'Eski bekleyen print joblar iptal edildi (SQL).');
    } catch (e) {
      paLog('warn', 'expireStalePendingJobsForTenant SQL: ' + (e?.message || e));
    }
    return;
  }
  if (!userJwt) return;
  try {
    const cutoff = new Date(Date.now() - PRINT_JOB_MAX_AGE_MINUTES * 60 * 1000).toISOString();
    const q = `/rest/v1/print_jobs?tenant_id=eq.${tenantId}&status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}`;
    const body = JSON.stringify({
      status: 'failed',
      error: 'Süresi doldu (otomatik iptal — kasa uzun süre kapalıydı veya yazıcı hatası)',
      updated_at: new Date().toISOString(),
    });
    const res = await supabaseFetch(q, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${userJwt}`, 'Prefer': 'return=minimal' },
      body,
    });
    if (res.ok) {
      paLog('log', `Eski bekleyen print joblar iptal edildi (created_at < ${cutoff}).`);
    } else {
      paLog('warn', 'Eski print job toplu iptal isteği başarısız', res.data);
    }
  } catch (e) {
    paLog('warn', 'expireStalePendingJobsForTenant: ' + (e?.message || e));
  }
}

function printJobIsExpired(job) {
  const raw = job?.created_at;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > PRINT_JOB_MAX_AGE_MINUTES * 60 * 1000;
}

/** Mobile/web'den printer_name boş geldiğinde mutfak yazıcısını tahmin et. */
function pickDefaultKitchenPrinter() {
  if (!Array.isArray(registeredKasaPrinters) || registeredKasaPrinters.length === 0) return '';
  const kw = ['mutfak', 'kitchen', 'mutfa', 'kasa', 'bar', 'grill', 'thermal', 'fis', 'fiş'];
  const named = registeredKasaPrinters
    .map((p) => (typeof p === 'string' ? p : (p?.name || p?.deviceName || '')))
    .filter(Boolean);
  for (const k of kw) {
    const hit = named.find((n) => n.toLowerCase().includes(k));
    if (hit) return hit;
  }
  // Hiçbiri eşleşmediyse OS default'una bırakmak (boş string) yerine
  // ilk fiziksel yazıcıyı seç — daha tahmin edilebilir.
  return named[0] || '';
}

// Realtime mesajlarını kaçırma sigortası: kasa açıkken ~8 sn'de bir pending
// job kontrolü (üst üste istek yok). Realtime çalışıyorsa fiş anında basılır.
function startPendingJobsPolling() {
  if (pendingJobsPollTimer) return;

  const scheduleNext = () => {
    const sqlMode = isElectronSqlServerMode();
    const delay = sqlMode
      ? PENDING_JOBS_POLL_SQL_MS
      : realtimeConnected
        ? PENDING_JOBS_POLL_REALTIME_MS
        : PENDING_JOBS_POLL_MS;
    pendingJobsPollTimer = setTimeout(() => {
      pendingJobsPollTimer = null;
      const sqlModeTick = isElectronSqlServerMode();
      if (!currentTenantId || (!sqlModeTick && !currentUserJwt)) {
        scheduleNext();
        return;
      }
      if (pendingJobsFetchInFlight) {
        scheduleNext();
        return;
      }
      pendingJobsFetchInFlight = true;
      fetchPendingJobs()
        .catch(() => {})
        .finally(() => {
          pendingJobsFetchInFlight = false;
        });
      if (!sqlModeTick && !realtimeConnected && currentTenantId && currentUserJwt && !realtimeReconnectTimer) {
        scheduleRealtimeReconnect('poll-fallback');
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
function stopPendingJobsPolling() {
  if (pendingJobsPollTimer) {
    clearTimeout(pendingJobsPollTimer);
    pendingJobsPollTimer = null;
  }
}

function clearRealtimeReconnectTimer() {
  if (realtimeReconnectTimer) {
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
  }
}

function scheduleRealtimeReconnect(reason) {
  if (isElectronSqlServerMode()) return;
  if (!currentTenantId || !currentUserJwt) return;
  if (realtimeReconnectTimer) return;
  const delay = Math.min(
    REALTIME_RECONNECT_BASE_MS * Math.pow(1.6, realtimeReconnectAttempts),
    REALTIME_RECONNECT_MAX_MS,
  );
  realtimeReconnectAttempts += 1;
  paLog('warn', 'Realtime yeniden bağlanma planlandı', { reason, delayMs: Math.round(delay) });
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    try {
      connectRealtimePrintAgent();
    } catch (err) {
      paLog('warn', 'Realtime bağlanma denemesi başarısız', { message: err?.message || String(err) });
      scheduleRealtimeReconnect('connect-failed');
    }
  }, delay);
}

function connectRealtimePrintAgent() {
  if (isElectronSqlServerMode()) return;
  // Do not open realtime socket before authenticated tenant context exists.
  if (!currentTenantId || !currentUserJwt) return;

  clearRealtimeReconnectTimer();

  if (realtimeWs) {
    try { realtimeWs.removeAllListeners(); } catch {}
    try { realtimeWs.close(); } catch {}
    realtimeWs = null;
  }

  const token = currentUserJwt || SUPABASE_ANON_KEY;
  const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';

  const { WebSocket } = require('ws');
  const ws = new WebSocket(wsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  realtimeWs = ws;

  let heartbeatInterval = null;
  let msgRef = 1;
  let closed = false;

  const cleanup = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (realtimeWs === ws) realtimeWs = null;
    realtimeConnected = false;
  };

  ws.on('open', () => {
    realtimeReconnectAttempts = 0;
    realtimeConnected = true;
    paLog('log', 'Supabase Realtime bağlandı (Print Agent)');

    const filter = currentTenantId
      ? `tenant_id=eq.${currentTenantId}`
      : undefined;

    const payload = {
      config: {
        broadcast: { self: false },
        presence: { key: '' },
        postgres_changes: [{
          event: 'INSERT',
          schema: 'public',
          table: 'print_jobs',
          ...(filter ? { filter } : {}),
        }],
      },
    };

    if (currentUserJwt) {
      payload.access_token = currentUserJwt;
    }

    try {
      ws.send(JSON.stringify({
        topic: 'realtime:public:print_jobs',
        event: 'phx_join',
        payload,
        ref: String(msgRef++),
      }));
    } catch (err) {
      paLog('warn', 'Realtime join gönderilemedi', { message: err?.message || String(err) });
    }

    heartbeatInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(msgRef++) }));
        } catch {
          /* socket kapanıyor */
        }
      }
    }, 25000);

    fetchPendingJobs();
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.event === 'postgres_changes' && msg.payload?.data?.type === 'INSERT') {
        const record = msg.payload.data.record;
        if (record && record.status === 'pending') {
          // Tenant izolasyonu zorunlu.
          if (currentTenantId && record.tenant_id !== currentTenantId) {
            return;
          }
          // Branch izolasyonu: bu kasanın branch'i set edildiyse, sadece
          // (kendi branch'i) VEYA (branch_id=null = tenant-wide fallback)
          // joblara bak. Aksi halde aynı tenant'taki başka şubenin fişini
          // bu kasada basarız.
          if (currentBranchId && record.branch_id && record.branch_id !== currentBranchId) {
            return;
          }
          await processPrintJob(record);
        }
      }
    } catch (err) {
      paLog('warn', 'Realtime mesaj hatası', { message: err?.message || String(err) });
    }
  });

  ws.on('close', () => {
    if (closed) return;
    closed = true;
    cleanup();
    paLog('log', 'Supabase Realtime bağlantısı kesildi.');
    scheduleRealtimeReconnect('close');
  });

  ws.on('error', (err) => {
    paLog('warn', 'Realtime WebSocket hatası', { message: err?.message || String(err) });
    // close olayı gelince tek noktadan yeniden bağlanır
  });
}

function startPrintAgent() {
  const http = require('http');
  printAgentServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/printers') {
      try {
        const printers = await getSystemPrinters();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printers }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, version: '1.0', app: 'ShefPOS Print Agent', realtime: realtimeConnected }));
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { html, printerName, silent } = JSON.parse(body);
          if (!html) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'html parametresi gerekli' }));
            return;
          }
          const result = await doPrint(html, printerName, silent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  });

  printAgentServer.listen(PRINT_AGENT_PORT, '127.0.0.1', () => {
    console.log(`ShefPOS Print Agent dinleniyor: http://127.0.0.1:${PRINT_AGENT_PORT}`);
  });

  printAgentServer.on('error', (err) => {
    console.error('Print Agent sunucu hatası:', err.message);
  });

  try {
    require('ws');
    // Realtime is started lazily after register-printers call with tenant + jwt.
  } catch {
    console.warn('ws paketi bulunamadı, Realtime devre dışı. Sadece local HTTP agent aktif.');
  }
}

function injectOfflineBanner() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      if (document.getElementById('__offline_banner__')) return;
      var banner = document.createElement('div');
      banner.id = '__offline_banner__';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;text-align:center;padding:6px 12px;font-size:13px;font-weight:bold;font-family:sans-serif;';
      banner.textContent = 'Bağlantı yok — Çevrimdışı modda çalışıyor';
      document.body.prepend(banner);
    })();
  `).catch(() => {});
}

function removeOfflineBanner() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      var b = document.getElementById('__offline_banner__');
      if (b) b.remove();
    })();
  `).catch(() => {});
}

function watchConnectivity() {
  if (!mainWindow) return;
  connectivityLastOnline = net.isOnline();

  setInterval(() => {
    const online = net.isOnline();
    if (online === connectivityLastOnline) return;
    connectivityLastOnline = online;
    if (!online) injectOfflineBanner();
    else removeOfflineBanner();
  }, 15000);
}

/** Kurumsal masaüstü menü çubuğu (Alt tuşu ile görünür). */
function buildApplicationMenu(win) {
  const template = [
    {
      label: 'Dosya',
      submenu: [{ role: 'quit', label: 'Çıkış' }],
    },
    {
      label: 'Düzenle',
      submenu: [
        { role: 'undo', label: 'Geri Al' },
        { role: 'redo', label: 'Yinele' },
        { type: 'separator' },
        { role: 'cut', label: 'Kes' },
        { role: 'copy', label: 'Kopyala' },
        { role: 'paste', label: 'Yapıştır' },
        { role: 'selectAll', label: 'Tümünü Seç' },
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        { role: 'reload', label: 'Yenile' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Yakınlaştırmayı Sıfırla' },
        { role: 'zoomIn', label: 'Yakınlaştır' },
        { role: 'zoomOut', label: 'Uzaklaştır' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tam Ekran' },
        ...(isDev
          ? [
              { type: 'separator' },
              { role: 'toggleDevTools', label: 'Geliştirici Araçları' },
            ]
          : []),
      ],
    },
    {
      label: 'Pencere',
      submenu: [
        { role: 'minimize', label: 'Küçült' },
        { role: 'close', label: 'Kapat' },
      ],
    },
    {
      label: 'Yardım',
      submenu: [
        {
          label: 'ŞefPOS Hakkında',
          click: () => {
            if (!win || win.isDestroyed()) return;
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'ŞefPOS',
              message: 'ŞefPOS — Restoran POS',
              detail: `Sürüm ${app.getVersion()}\nwww.sefpos.com.tr\nDestek: 0544 244 90 80`,
              buttons: ['Tamam'],
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Web sitesi',
          click: () => shell.openExternal('https://www.sefpos.com.tr'),
        },
        {
          label: 'Teknik destek',
          click: () => shell.openExternal('tel:+905442449080'),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

/** `show:false` + yalnizca `ready-to-show` ile acilan pencereler bazi Windows surumlerinde gorunmez kalabiliyor. */
let _mainWindowRevealTimer = null;
let _mainWindowRevealDone = false;

function clearMainWindowRevealTimer() {
  if (_mainWindowRevealTimer) {
    clearTimeout(_mainWindowRevealTimer);
    _mainWindowRevealTimer = null;
  }
}

/**
 * Ana pencereyi kullaniciya gosterir. ready-to-show gecikirse veya ikinci
 * Sefpos.exe tiklamasi tek-instance lock ile mevcut prosesi one alirken
 * pencere hala gizliyse bu fonksiyon devreye girer.
 */
function revealMainWindow(opts = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    if (opts.center !== false) mainWindow.center();
    mainWindow.focus();
    if (opts.maximize !== false && process.platform === 'win32') {
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
          mainWindow.maximize();
        }
      });
    }
    _mainWindowRevealDone = true;
    clearMainWindowRevealTimer();
    if (opts.reason) {
      paLog('info', '[window] pencere gosterildi', { reason: opts.reason });
    }
    return true;
  } catch (e) {
    paLog('warn', '[window] revealMainWindow', { message: e?.message || String(e) });
    return false;
  }
}

function scheduleMainWindowRevealFallback() {
  clearMainWindowRevealTimer();
  _mainWindowRevealTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || _mainWindowRevealDone) return;
    if (!mainWindow.isVisible()) {
      paLog('warn', '[window] ready-to-show gecikti; pencere zorla aciliyor');
      revealMainWindow({ maximize: true, reason: 'fallback-timeout' });
    }
  }, 10000);
}

function createWindow() {
  _mainWindowRevealDone = false;
  clearMainWindowRevealTimer();
  const settings = loadSettings();
  let mainLoadRetried = false;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      partition: 'persist:shefpos',
      backgroundThrottling: process.env.SEFPOS_FULL_SPEED_BACKGROUND === '1' ? false : true,
      devTools: isDev,
      webSecurity: true,
    },
    // Windows'ta ICO çoklu çözünürlük desteği daha temiz görünür; SEFPOS.ico
    // bulunamazsa PNG'ye düşer.
    icon: (() => {
      const ico = path.join(__dirname, '../public/SEFPOS.ico');
      const png = path.join(__dirname, '../public/logo.png');
      try {
        return fs.existsSync(ico) ? ico : png;
      } catch {
        return png;
      }
    })(),
    title: 'Sefpos',
    show: false,
    // Splash ile aynı arka plan rengi: ilk pencere açılışında mavi flash yerine
    // beyaz arka plan görünür.
    backgroundColor: '#ffffff',
  });
  try {
    Menu.setApplicationMenu(buildApplicationMenu(mainWindow));
  } catch (e) {
    console.warn('[menu] application menu set failed:', e?.message || e);
  }

  // Kamera / mikrofon izinlerini Electron tarafında otomatik ver
  // (barkod tarayıcı, gelecekte sesli not vb. için gerekli)
  try {
    const ses = mainWindow.webContents.session;
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'display-capture') {
        return callback(true);
      }
      callback(true);
    });
    ses.setPermissionCheckHandler((_wc, permission) => {
      if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'display-capture') {
        return true;
      }
      return true;
    });
  } catch (e) {
    console.warn('[permissions] handler set failed:', e?.message || e);
  }

  // Production: kullanıcı ŞefPOS penceresine geri döndüğünde güncelleme kontrolünü seyrek tekrarla.
  if (!isDev) {
    mainWindow.on('focus', () => {
      maybeCheckUpdatesOnUserActivity();
    });
  }

  scheduleMainWindowRevealFallback();

  mainWindow.once('ready-to-show', () => {
    if (settings.zoomFactor) {
      mainWindow.webContents.setZoomFactor(settings.zoomFactor);
    }
    revealMainWindow({ maximize: true, reason: 'ready-to-show' });
    watchConnectivity();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      revealMainWindow({ maximize: true, reason: 'did-finish-load' });
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    paLog('error', '[window] render-process-gone', details || {});
    revealMainWindow({ maximize: false, reason: 'render-process-gone' });
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'ŞefPOS',
          message: 'Arayüz beklenmedik şekilde kapandı',
          detail: 'Sayfa yeniden yüklenecek. Sorun sürerse uygulamayı kapatıp tekrar açın.',
          buttons: ['Yeniden yükle', 'Tamam'],
          defaultId: 0,
        }).then((choice) => {
          if (choice.response === 0 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reloadIgnoringCache();
          }
        });
      }
    } catch (_) {
      /* yoksay */
    }
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${readSefposDevServerPort()}`);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // Üretim: DevTools kapalı (müşteri EXE incelemesini zorlaştırır). Destek: Ctrl+Shift+Alt+S kilidi açar.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    try {
      const k = String(input.key || '').toLowerCase();
      if (input.control && input.shift && input.alt && k === 's') {
        supportDevToolsUnlocked = !supportDevToolsUnlocked;
        try {
          mainWindow.webContents.setDevToolsEnabled(supportDevToolsUnlocked);
        } catch {
          /* */
        }
        event.preventDefault();
        return;
      }
      if (k === 'f12' || (input.control && input.shift && k === 'i')) {
        if (productionDevToolsAllowed()) {
          mainWindow.webContents.toggleDevTools();
        }
        event.preventDefault();
        return;
      }
      if (input.control && input.shift && k === 'r' && productionDevToolsAllowed()) {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
      }
    } catch (_) { /* yoksay */ }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (!isDev && errorCode !== -3 && !mainLoadRetried) {
      mainLoadRetried = true;
      const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
      mainWindow.loadFile(indexPath);
      return;
    }
    if (!isDev && errorCode !== -3) {
      paLog('error', '[window] did-fail-load', { errorCode, errorDescription });
      revealMainWindow({ maximize: true, reason: 'did-fail-load' });
      try {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'ŞefPOS açılamadı',
          message: 'Uygulama dosyaları yüklenemedi',
          detail: `Hata kodu: ${errorCode}\n${errorDescription || ''}\n\nKurulumu onarın veya destek ile iletişime geçin.`,
          buttons: ['Tamam'],
        });
      } catch (_) {
        /* yoksay */
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Yanlışlıkla X tıklamaya / Alt+F4'e karşı çıkış onayı.
  // `quitConfirmed = true` olursa veya dev modda ise atlanır; auto-updater
  // `quitAndInstall` çağırdığında da `quitConfirmed`'i set ediyoruz.
  mainWindow.on('close', (e) => {
    if (quitConfirmed) return;
    if (isDev) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Vazgeç', 'Evet, Çıkış Yap'],
      defaultId: 0,
      cancelId: 0,
      title: 'ŞefPOS — Çıkış',
      message: 'ŞefPOS\'tan çıkmak istediğinizden emin misiniz?',
      detail:
        'Açık masalar ve bekleyen siparişler kaybolmaz; yalnızca bu terminal kapanır.\nYazıcı agent\'ı ve Caller ID dinleyici de durdurulacak.',
      noLink: true,
    });
    if (choice === 1) {
      quitConfirmed = true;
      mainWindow.close();
    }
  });

  mainWindow.on('closed', () => {
    clearMainWindowRevealTimer();
    mainWindow = null;
    _mainWindowRevealDone = false;
  });
}

let quitConfirmed = false;
app.on('before-quit', () => {
  quitConfirmed = true;
});

ipcMain.handle('get-zoom', () => {
  const settings = loadSettings();
  return settings.zoomFactor || null;
});

ipcMain.handle('set-zoom', (_, zoomFactor) => {
  if (mainWindow) {
    mainWindow.webContents.setZoomFactor(zoomFactor);
    saveSettings({ zoomFactor });
  }
  return true;
});

/** Windows kayıt defterinden SQL Server örneklerini listeler (kurulum sihirbazı). */
function detectSqlServerInstances() {
  const downloadUrl = 'https://go.microsoft.com/fwlink/?linkid=866662';
  if (process.platform !== 'win32') {
    return {
      ok: false,
      platform: process.platform,
      hasSqlServer: false,
      instances: [],
      recommendedHost: '.\\SQLEXPRESS',
      downloadUrl,
      sqlExpressInstalled: false,
      sqlExpressRunning: false,
    };
  }
  const instances = [];
  try {
    const namesOut = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL"',
      { encoding: 'utf8', windowsHide: true, timeout: 8000 },
    );
    for (const line of namesOut.split(/\r?\n/)) {
      const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(\S+)/);
      if (!m) continue;
      const instanceName = m[1];
      let serviceRunning = false;
      const serviceName = instanceName.toUpperCase() === 'MSSQLSERVER'
        ? 'MSSQLSERVER'
        : `MSSQL$${instanceName}`;
      try {
        const svcOut = execSync(`sc query "${serviceName}"`, {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
        });
        serviceRunning = /STATE\s+:\s+\d+\s+RUNNING/i.test(svcOut);
      } catch { /* ignore */ }
      const tcpPort = resolveNamedInstanceTcpPort(instanceName);
      instances.push({ instanceName, serviceRunning, tcpPort });
    }
  } catch { /* SQL yüklü değil */ }
  const sqlexpress = instances.find((i) => i.instanceName.toUpperCase() === 'SQLEXPRESS');
  const first = instances[0];
  const recommendedHost = sqlexpress
    ? '.\\SQLEXPRESS'
    : first
      ? `.\\${first.instanceName}`
      : '.\\SQLEXPRESS';
  return {
    ok: true,
    platform: process.platform,
    hasSqlServer: instances.length > 0,
    instances,
    recommendedHost,
    downloadUrl,
    sqlExpressInstalled: !!sqlexpress,
    sqlExpressRunning: !!sqlexpress?.serviceRunning,
  };
}

ipcMain.handle('detect-sql-server', () => detectSqlServerInstances());

ipcMain.handle('get-db-mode', () => {
  const settings = loadSettings();
  const mode = settings.dbMode || null;
  if (mode === 'postgres') return 'sqlserver';
  return mode;
});

ipcMain.handle('set-db-mode', (_, mode) => {
  const normalized = mode === 'postgres' ? 'sqlserver' : mode;
  saveSettings({ dbMode: normalized });
  return true;
});

ipcMain.handle('get-sqlserver-config', () => {
  const settings = loadSettings();
  return settings.sqlServerConfig || null;
});

ipcMain.handle('set-sqlserver-config', (_, config) => {
  saveSettings({ sqlServerConfig: config });
  return true;
});

function getSqlPatchFilePath() {
  const candidates = isDev
    ? [path.join(__dirname, '../shefpos_sqlserver_patches.sql')]
    : [
        path.join(process.resourcesPath, 'shefpos_sqlserver_patches.sql'),
        path.join(process.resourcesPath, 'app', 'shefpos_sqlserver_patches.sql'),
        path.join(app.getAppPath(), 'shefpos_sqlserver_patches.sql'),
        path.join(__dirname, '../shefpos_sqlserver_patches.sql'),
      ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function applySqlSchemaPatches(norm) {
  const patchFile = getSqlPatchFilePath();
  if (!patchFile) return { executed: 0, errors: ['shefpos_sqlserver_patches.sql bulunamadi'] };
  const dbName = (norm.database || 'sefpos45').replace(/[^a-zA-Z0-9_]/g, '') || 'sefpos45';
  const content = fs.readFileSync(patchFile, 'utf8');
  const batches = content
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^USE\s+/i.test(b));
  let executed = 0;
  const errors = [];
  const pool = getMssql()
    ? await mssqlConnectOnce(norm, dbName)
    : await tediousConnect(norm, dbName);
  const useMssql = !!getMssql() && pool.request;
  try {
    for (const batch of batches) {
      try {
        if (useMssql) await mssqlQuery(pool, batch, null);
        else await tediousQuery(pool, batch, null);
        executed++;
      } catch (batchErr) {
        const msg = batchErr.message || '';
        if (!/already an object|already exists|already have/i.test(msg)) {
          errors.push(msg.slice(0, 180));
        }
      }
    }
  } finally {
    if (useMssql) {
      try { await pool.close(); } catch {}
    } else {
      tediousClose(pool);
    }
  }
  return { executed, errors };
}

ipcMain.handle('sql-apply-schema-patches', async (_, config) => {
  try {
    const norm = normalizeSqlServerConfig(config || loadSettings().sqlServerConfig);
    if (!getMssql() && !getTedious()) {
      return { success: false, error: 'SQL kutuphanesi yuklenemedi' };
    }
    const patch = await applySqlSchemaPatches(norm);
    return {
      success: patch.executed > 0 || patch.errors.length === 0,
      output: `${patch.executed} patch batch (waiter_calls, print_settings).`,
      errors: patch.errors,
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('import-sqlserver-schema', async (_, config) => {
  let norm;
  try {
    norm = normalizeSqlServerConfig(config);
  } catch (e) {
    return { success: false, error: e.message || 'Gecersiz ayar' };
  }
  saveSettings({ sqlServerConfig: norm });

  const candidates = isDev
    ? [path.join(__dirname, '../shefpos_sqlserver.sql')]
    : [
        path.join(process.resourcesPath, 'shefpos_sqlserver.sql'),
        path.join(process.resourcesPath, 'app', 'shefpos_sqlserver.sql'),
        path.join(app.getAppPath(), 'shefpos_sqlserver.sql'),
        path.join(__dirname, '../shefpos_sqlserver.sql'),
        path.join(__dirname, '../../shefpos_sqlserver.sql'),
      ];

  const sqlFile = candidates.find(p => fs.existsSync(p));

  if (!sqlFile) {
    return { success: false, error: 'Schema dosyasi bulunamadi. Aranan konumlar: ' + candidates.join(', ') };
  }

  if (!getMssql() && !getTedious()) {
    return { success: false, error: 'SQL Server kutuphanesi yuklenemedi. Uygulamayi yeniden yukleyin.' };
  }

  try {
    const resolvedHost = formatSqlResolvedHost(norm, 'master');

    const dbName = (norm.database || 'sefpos45').replace(/[^a-zA-Z0-9_]/g, '') || 'sefpos45';
    const masterPool = getMssql()
      ? await mssqlConnectOnce(norm, 'master')
      : await tediousConnect(norm, 'master');
    const useMssql = !!getMssql() && masterPool.request;
    try {
      const createSql = `IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${dbName}') CREATE DATABASE [${dbName}]`;
      if (useMssql) {
        await mssqlQuery(masterPool, createSql, null);
      } else {
        await tediousQuery(masterPool, createSql, null);
      }
    } finally {
      if (useMssql) {
        try { await masterPool.close(); } catch {}
      } else {
        tediousClose(masterPool);
      }
    }

    const schemaContent = fs.readFileSync(sqlFile, 'utf8');
    const goBatches = schemaContent
      .split(/^\s*GO\s*$/im)
      .map(b => b.trim())
      .filter(b => b.length > 0 && !/^USE\s+\[?sefpos45\]?\s*$/i.test(b));

    let executed = 0;
    const errors = [];
    const schemaConn = getMssql()
      ? await mssqlConnectOnce(norm, dbName)
      : await tediousConnect(norm, dbName);
    const schemaMssql = !!getMssql() && schemaConn.request;
    try {
      for (const batch of goBatches) {
        try {
          if (schemaMssql) {
            await mssqlQuery(schemaConn, batch, null);
          } else {
            await tediousQuery(schemaConn, batch, null);
          }
          executed++;
        } catch (batchErr) {
          const msg = batchErr.message || '';
          const isAlreadyExists = /already an object|already exists|Cannot add.*already|Violation of PRIMARY KEY/i.test(msg);
          if (!isAlreadyExists) {
            errors.push(msg.slice(0, 200));
          }
        }
      }
    } finally {
      if (schemaMssql) {
        try { await schemaConn.close(); } catch {}
      } else {
        tediousClose(schemaConn);
      }
    }

    if (executed < 5) {
      return {
        success: false,
        error: `Sema yuklenemedi (${executed} batch). Sunucu: ${resolvedHost}. Ilk hata: ${errors[0] || 'baglanti kopuk'}`,
        resolvedHost,
      };
    }
    if (errors.length > 0 && executed < 15) {
      return {
        success: false,
        error: `Sema eksik kaldi (${executed} batch, ${errors.length} hata). ${errors.slice(0, 2).join(' | ')}`,
        resolvedHost,
      };
    }

    let adminCreated = false;
    try {
      const ensured = await ensureDefaultAdminUser(norm, dbName, { resetPassword: true });
      adminCreated = !!ensured.created;
      const verify = await verifyDefaultAdminLogin(norm, dbName);
      if (!verify.ok) {
        errors.push(verify.error || 'ADMIN giris dogrulamasi basarisiz');
      }
    } catch (adminErr) {
      errors.push('Admin kullanici olusturulamadi: ' + (adminErr.message || '').slice(0, 150));
    }

    const patch = await applySqlSchemaPatches(norm);
    closeMssqlPool();
    const patchNote =
      patch.executed > 0
        ? ` Ek tablolar: ${patch.executed} patch.`
        : patch.errors.length > 0
          ? ` Patch uyari: ${patch.errors[0]}`
          : '';

    return {
      success: true,
      adminCreated,
      resolvedHost,
      output: `${executed} batch yuklendi (sunucu: ${resolvedHost}).${adminCreated ? ' Giris: ADMIN / 1234' : ' Giris: ADMIN / 1234 (mevcut).'}${patchNote}${errors.length > 0 ? ' ' + errors.length + ' uyari.' : ''}`,
    };
  } catch (err) {
    const msg = err.message || 'Bilinmeyen hata';
    let hint = '';
    try {
      const tc = buildTediousConfig(norm, 'master');
      hint = ' Cozulen adres: ' + tc.server + (tc.options.instanceName ? '\\' + tc.options.instanceName : '');
    } catch { /* ignore */ }
    return { success: false, error: msg + hint };
  }
});

ipcMain.handle('get-printers', async () => {
  return await getSystemPrinters();
});

/** Ayarlar > Sistem — kasa yük tanılama (yazıcı agent + bellek). */
ipcMain.handle('get-system-diagnostics', async () => {
  const mem = process.memoryUsage();
  return {
    pollMs: PENDING_JOBS_POLL_MS,
    realtimeConnected: !!realtimeConnected,
    pendingPollActive: !!pendingJobsPollTimer,
    hasTenant: !!currentTenantId,
    hasJwt: !!currentUserJwt,
    sqlServerMode: isElectronSqlServerMode(),
    processMemoryMb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    },
  };
});

let printWindows = [];

ipcMain.handle('print-receipt', async (_, { html, printerName, silent }) => {
  return await doPrint(html, printerName, silent);
});

ipcMain.handle('register-printers', async (_, { tenantId, branchId, userJwt }) => {
  try {
    const tenantChanged = currentTenantId !== tenantId;
    const branchChanged = currentBranchId !== (branchId || null);
    currentTenantId = tenantId;
    currentBranchId = branchId || null;
    currentUserJwt = userJwt;

    const printers = await getSystemPrinters();
    registeredKasaPrinters = printers || [];
    paLog('log', `register-printers: tenant=${tenantId}, branch=${branchId || '-'}, ${(printers||[]).length} yazıcı bulundu.`, {
      tenantId,
      branchId: branchId || null,
      printerNames: (printers || []).map((p) => (typeof p === 'string' ? p : (p?.name || p?.deviceName || ''))).filter(Boolean),
      hasJwt: !!userJwt,
      sqlMode: isElectronSqlServerMode(),
      anonKeyLen: SUPABASE_ANON_KEY?.length || 0,
    });

    if (isElectronSqlServerMode()) {
      const cfg = loadSettings().sqlServerConfig;
      const tedious = getTedious();
      const printersJson = JSON.stringify(printers || []);
      const existing = await runSql(
        `SELECT TOP 1 id FROM printer_registrations WHERE tenant_id = @tenant_id
         AND (branch_id = @branch_id OR (@branch_id IS NULL AND branch_id IS NULL))`,
        {
          tenant_id: { type: tedious?.TYPES?.UniqueIdentifier, value: tenantId },
          branch_id: { type: tedious?.TYPES?.UniqueIdentifier, value: branchId || null },
        },
        cfg,
      );
      if (existing?.length > 0) {
        await runSql(
          `UPDATE printer_registrations SET printers = @printers, last_seen_at = GETUTCDATE(), branch_id = @branch_id
           WHERE tenant_id = @tenant_id AND id = @id`,
          {
            printers: { type: tedious?.TYPES?.NVarChar, value: printersJson },
            branch_id: { type: tedious?.TYPES?.UniqueIdentifier, value: branchId || null },
            tenant_id: { type: tedious?.TYPES?.UniqueIdentifier, value: tenantId },
            id: { type: tedious?.TYPES?.UniqueIdentifier, value: existing[0].id },
          },
          cfg,
        );
      } else {
        await runSql(
          `INSERT INTO printer_registrations (id, tenant_id, branch_id, printers, last_seen_at)
           VALUES (NEWID(), @tenant_id, @branch_id, @printers, GETUTCDATE())`,
          {
            tenant_id: { type: tedious?.TYPES?.UniqueIdentifier, value: tenantId },
            branch_id: { type: tedious?.TYPES?.UniqueIdentifier, value: branchId || null },
            printers: { type: tedious?.TYPES?.NVarChar, value: printersJson },
          },
          cfg,
        );
      }
      paLog('log', 'register-printers: SQL Server modu — yazıcılar yerel DB kaydedildi.');
      await expireStalePendingJobsForTenant(tenantId, null);
      processingJobIds.clear();
      fetchPendingJobs().catch(() => {});
      startPendingJobsPolling();
      return { success: true, count: printers.length, mode: 'sqlserver' };
    }

    const checkRes = await supabaseFetch(
      `/rest/v1/printer_registrations?tenant_id=eq.${tenantId}&select=id`,
      { headers: { 'Authorization': `Bearer ${userJwt}` } }
    );

    if (!checkRes.ok) {
      paLog('error', `register-printers: printer_registrations okuma HATA (${checkRes.status})`, checkRes.data);
    } else {
      paLog('log', `register-printers: printer_registrations okuma OK, mevcut kayıt sayısı=${Array.isArray(checkRes.data) ? checkRes.data.length : 0}`);
    }

    if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
      await supabaseFetch(
        `/rest/v1/printer_registrations?tenant_id=eq.${tenantId}`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${userJwt}`, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ printers, last_seen_at: new Date().toISOString(), branch_id: branchId || null }),
        }
      );
    } else {
      await supabaseFetch(
        `/rest/v1/printer_registrations`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${userJwt}`, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ tenant_id: tenantId, branch_id: branchId || null, printers, last_seen_at: new Date().toISOString() }),
        }
      );
    }

    await expireStalePendingJobsForTenant(tenantId, userJwt);

    try {
      const sessionPath = path.join(app.getPath('userData'), 'print-agent-session.json');
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      writeSecureJson(sessionPath.replace(/\.json$/, '.secure.json'), {
        tenantId,
        branchId: branchId || null,
        printers: printers || [],
        savedAt: new Date().toISOString(),
      });
      try {
        if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
      } catch {
        /* */
      }
      paLog('log', `print-agent-session.json güncellendi (${sessionPath})`);
    } catch (sessErr) {
      paLog('warn', 'print-agent-session yazılamadı: ' + (sessErr?.message || sessErr));
    }

    if (!isElectronSqlServerMode()) {
      if (tenantChanged || branchChanged || !realtimeConnected) {
        paLog('log', 'Tenant/branch değişti, Realtime yeniden bağlanıyor...');
        processingJobIds.clear();
        realtimeReconnectAttempts = 0;
        connectRealtimePrintAgent();
      } else {
        fetchPendingJobs();
      }
    }

    // Realtime sigortası: 20sn'lik polling fallback (Realtime düşse veya
    // mesajı kaçırsa bile mobilden gelen siparişleri yakalar).
    startPendingJobsPolling();

    return { success: true, count: printers.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-test-connection', async (_, config) => {
  closeSqlPool();
  if (!getMssql() && !getTedious()) {
    return { success: false, error: 'SQL Server kutuphanesi yuklenemedi. Uygulamayi yeniden yukleyin.' };
  }
  try {
    const norm = normalizeSqlServerConfig(config);
    saveSettings({ sqlServerConfig: norm });
    let rows;
    let resolvedHost;
    if (getMssql()) {
      const r = await mssqlTestConnection(norm);
      rows = r.rows;
      resolvedHost = r.resolvedHost;
    } else {
      const conn = await tediousConnect(norm, 'master');
      try {
        rows = await tediousQuery(conn, 'SELECT @@VERSION AS ver', null);
      } finally {
        tediousClose(conn);
      }
      resolvedHost = formatSqlResolvedHost(norm, 'master');
    }
    const tc = buildTediousConfig(norm, 'master');
    if (tc.options.port && !String(norm.port || '').trim()) {
      resolvedHost = `${tc.server}:${tc.options.port}`;
    }
    const ver = rows && rows[0] ? String(rows[0].ver || '').split('\n')[0].trim() : '';
    return { success: true, sqlVersion: ver.slice(0, 120), resolvedHost };
  } catch (err) {
    const msg = err.message || 'Baglanti basarisiz';
    if (/login failed|18456/i.test(msg)) {
      return { success: false, error: 'Giris basarisiz: kullanici adi veya sifre hatali (SA).' };
    }
    if (/cannot open database|4060/i.test(msg)) {
      return { success: false, error: msg + ' — Once «Veritabanini Kur» ile veritabanini olusturun.' };
    }
    if (/ETIMEOUT|timeout|zaman asimi/i.test(msg)) {
      return {
        success: false,
        error:
          msg +
          ' — Sunucu: .\\ornek (Port bos). SQL Browser kapaliysa port kayittan okunur; yine olmazsa SSMS ile TCP portunu yazin.',
      };
    }
    return { success: false, error: msg };
  }
});

ipcMain.handle('postgres-test-connection', async (_, config) => {
  try {
    const client = await pgConnect(config);
    try {
      await client.query('SELECT 1 AS ok');
    } finally {
      await client.end();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Bağlantı başarısız' };
  }
});

ipcMain.handle('postgres-init-database', async (_, config) => {
  try {
    const norm = normalizePgConfig(config);
    const adminClient = await pgConnect(norm, 'postgres');
    try {
      const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1', [norm.database]);
      if ((exists?.rows || []).length === 0) {
        await adminClient.query(`CREATE DATABASE "${norm.database.replace(/"/g, '""')}"`);
      }
    } finally {
      await adminClient.end();
    }

    const appClient = await pgConnect(norm, norm.database);
    try {
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id uuid PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          tenant_id uuid NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id uuid PRIMARY KEY,
          name text NOT NULL,
          slug text NOT NULL,
          subscription_status text NOT NULL DEFAULT 'active',
          deployment_mode text,
          onboarding_completed boolean DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS branches (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          name text NOT NULL,
          is_main boolean DEFAULT true,
          is_active boolean DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          name text NOT NULL,
          permissions jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL,
          tenant_id uuid NOT NULL,
          branch_id uuid,
          role_id uuid,
          role text NOT NULL DEFAULT 'owner',
          full_name text,
          email text,
          onboarding_completed boolean DEFAULT true,
          is_super_admin boolean DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    } finally {
      await appClient.end();
    }

    return { success: true, output: `${norm.database} veritabanı hazırlandı.` };
  } catch (err) {
    return { success: false, error: err.message || 'PostgreSQL kurulum hatası' };
  }
});

ipcMain.handle('sql-health-check', async (_, config) => {
  try {
    if (!getMssql() && !getTedious()) {
      return { success: false, ok: false, error: 'SQL kutuphanesi yuklenemedi', missing: [] };
    }
    const norm = normalizeSqlServerConfig(config || loadSettings().sqlServerConfig);
    const required = [
      'restaurant_tables',
      'orders',
      'order_items',
      'products',
      'categories',
      'app_users',
      'payment_transactions',
    ];
    const missing = [];
    const tedious = getTedious();
    for (const tableName of required) {
      const rows = await runSql(
        `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @t`,
        { t: { type: tedious.TYPES.NVarChar, value: tableName } },
        norm,
      );
      if (!rows?.length) missing.push(tableName);
    }
    return {
      success: true,
      ok: missing.length === 0,
      missing,
      database: norm.database || 'sefpos45',
    };
  } catch (err) {
    return { success: false, ok: false, error: err.message || 'Kontrol basarisiz', missing: [] };
  }
});

ipcMain.handle('sql-login', async (_, { email, password }) => {
  try {
    return await performSqlLoginByEmail(email, password);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('resolve-sql-tenant-for-hybrid', async () => {
  try {
    const settings = loadSettings();
    const cfg = settings.sqlServerConfig;
    if (!cfg?.host) {
      return { success: false, error: 'SQL kurulumu tamamlanmamis — once «Test Et + Kur ve Basla» adimini yapin' };
    }
    const norm = normalizeSqlServerConfig(cfg);
    const dbName = norm.database || 'sefpos45';
    const resolved = await resolveSqlTenantForHybrid(norm, dbName);
    return { success: true, ...resolved };
  } catch (err) {
    return { success: false, error: err.message || 'SQL tenant cozulemedi' };
  }
});

ipcMain.handle('sync-hybrid-kasa-user', async (_, payload) => {
  try {
    const settings = loadSettings();
    const cfg = settings.sqlServerConfig;
    if (!cfg) return { success: false, error: 'SQL yapilandirmasi yok' };
    const norm = normalizeSqlServerConfig(cfg);
    const dbName = norm.database || 'sefpos45';
    const result = await syncHybridKasaUserToSql(norm, dbName, payload || {});
    const link = settings.hybridLink || {};
    saveSettings({
      hybridLink: { ...link, kasaLoginEmail: result.email },
    });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message || 'Senkron hatasi' };
  }
});

ipcMain.handle('hybrid-kasa-login', async (_, { email, password }) => {
  try {
    const settings = loadSettings();
    const link = settings.hybridLink;
    if (!link?.sqlTenantId || !link?.cloudTenantId) {
      return { success: false, error: 'Once bulut hesabini baglayin' };
    }
    const cfg = settings.sqlServerConfig;
    if (!cfg) return { success: false, error: 'SQL yapilandirmasi yok' };
    const norm = normalizeSqlServerConfig(cfg);
    const dbName = norm.database || 'sefpos45';
    const loginEmail = String(email || '').trim().toLowerCase();

    const { cloudPasswordSignIn, fetchCloudProfile } = require('./hybridSync.cjs');
    const auth = await cloudPasswordSignIn(loginEmail, password);
    const profile = await fetchCloudProfile(auth.access_token, auth.user?.id);
    if (!profile?.tenant_id || profile.tenant_id !== link.cloudTenantId) {
      return { success: false, error: 'Bu bulut hesabi bagli isletmeye ait degil' };
    }

    await syncHybridKasaUserToSql(norm, dbName, {
      email: loginEmail,
      password,
      sqlTenantId: link.sqlTenantId,
      sqlBranchId: link.sqlBranchId || profile.branch_id,
      fullName: profile.full_name,
      tenantName: link.tenantName,
    });
    saveSettings({
      hybridLink: {
        ...link,
        kasaLoginEmail: loginEmail,
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token || link.refreshToken || null,
        expiresAt: auth.expires_at || link.expiresAt || null,
      },
    });
    return await performSqlLoginByEmail(loginEmail, password);
  } catch (err) {
    return { success: false, error: err.message || 'Giris basarisiz' };
  }
});

ipcMain.handle('sql-update-tenant-profile', async (_, payload) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { success: false, error: 'tedious paketi yuklenemedi' };
    const p = payload || {};
    const tenantId = String(p.tenantId || '');
    if (!tenantId) return { success: false, error: 'tenant_id zorunlu' };
    const params = {
      tid: { type: tedious.TYPES.UniqueIdentifier, value: tenantId },
      name: { type: tedious.TYPES.NVarChar, value: p.name ?? null },
      address: { type: tedious.TYPES.NVarChar, value: p.address ?? null },
      phone: { type: tedious.TYPES.NVarChar, value: p.phone ?? null },
      email: { type: tedious.TYPES.NVarChar, value: p.email ?? null },
      expires: p.subscription_expires_at
        ? { type: tedious.TYPES.DateTime2, value: new Date(p.subscription_expires_at) }
        : { type: tedious.TYPES.DateTime2, value: null },
    };
    await runSql(
      `UPDATE tenants SET
         name = COALESCE(@name, name),
         address = COALESCE(@address, address),
         phone = COALESCE(@phone, phone),
         email = COALESCE(@email, email),
         subscription_expires_at = COALESCE(@expires, subscription_expires_at),
         subscription_status = N'active',
         deployment_mode = N'offline',
         subscription_plan = COALESCE(subscription_plan, N'professional')
       WHERE id = @tid`,
      params,
    );
    if (p.branchId) {
      await runSql(
        `UPDATE branches SET
           name = COALESCE(@bn, name),
           address = COALESCE(@ba, address),
           phone = COALESCE(@bp, phone)
         WHERE id = @bid`,
        {
          bid: { type: tedious.TYPES.UniqueIdentifier, value: String(p.branchId) },
          bn: { type: tedious.TYPES.NVarChar, value: p.branchName ?? null },
          ba: { type: tedious.TYPES.NVarChar, value: p.branchAddress ?? null },
          bp: { type: tedious.TYPES.NVarChar, value: p.branchPhone ?? null },
        },
      );
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('sql-register', async (_, { email, passwordHash, fullName, tenantName, tenantSlug }) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { success: false, error: 'tedious paketi yuklenemedi' };
    const slug = (tenantSlug || tenantName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50) || 'isletme';
    const rows = await runSql(
      `EXEC sp_create_tenant_and_user @email, @password_hash, @full_name, @tenant_name, @tenant_slug`,
      {
        email: { type: tedious.TYPES.NVarChar, value: email },
        password_hash: { type: tedious.TYPES.NVarChar, value: passwordHash },
        full_name: { type: tedious.TYPES.NVarChar, value: fullName },
        tenant_name: { type: tedious.TYPES.NVarChar, value: tenantName },
        tenant_slug: { type: tedious.TYPES.NVarChar, value: slug },
      }
    );
    const row = rows && rows[0];
    return {
      success: true,
      user_id: row ? row.user_id : null,
      tenant_id: row ? row.tenant_id : null,
      branch_id: row ? row.branch_id : null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-hash-password', async (_, password) => {
  try {
    const bcrypt = getBcrypt();
    if (!bcrypt) return { success: false, error: 'bcryptjs yuklenemedi' };
    const hash = await bcrypt.hash(password, 10);
    return { success: true, hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-login', async (_, { email, password }) => {
  try {
    const record = await localDbLogin({ email, password });
    return { success: true, data: record };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-register', async (_, { email, password, fullName, tenantName }) => {
  try {
    const result = await localDbCreateTenantAndUser({ email, password, fullName, tenantName });
    const record = await localDbLogin({ email, password });
    return { success: true, data: record, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-add-user', async (_, { email, password, fullName, tenantId, branchId, roleId, role }) => {
  try {
    const result = await localDbAddUser({ email, password, fullName, tenantId, branchId, roleId, role });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-change-password', async (_, { userId, newPassword }) => {
  try {
    await localDbChangePassword(userId, newPassword);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-users', (_, { tenantId }) => {
  try {
    const users = localDbGetUsers(tenantId);
    return { success: true, data: users };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-roles', (_, { tenantId }) => {
  try {
    return { success: true, data: localDbGetRoles(tenantId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-branches', (_, { tenantId }) => {
  try {
    return { success: true, data: localDbGetBranches(tenantId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-update-profile', (_, { profileId, updates }) => {
  try {
    localDbUpdateProfile(profileId, updates);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-terminal-users', (_, { tenantId } = {}) => {
  try {
    return { success: true, data: localDbGetTerminalUsers(tenantId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-is-empty', () => {
  try {
    return { success: true, empty: localDbIsEmpty() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-read', (_, { table, tenantId }) => {
  try {
    const db = localDbEnsureDefaults(loadLocalDb());
    let rows = db[table] || [];
    if (tenantId) rows = rows.filter(r => r.tenant_id === tenantId || !r.tenant_id);
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-write', (_, { table, row }) => {
  try {
    const db = localDbEnsureDefaults(loadLocalDb());
    if (!db[table]) db[table] = [];
    const idx = db[table].findIndex(r => r.id === row.id);
    if (idx >= 0) db[table][idx] = { ...db[table][idx], ...row };
    else db[table].push({ ...row, id: row.id || require('crypto').randomUUID(), created_at: row.created_at || new Date().toISOString() });
    saveLocalDb(db);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-delete', (_, { table, id }) => {
  try {
    const db = localDbEnsureDefaults(loadLocalDb());
    if (db[table]) db[table] = db[table].filter(r => r.id !== id);
    saveLocalDb(db);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-find-profile-by-username', async (_, username) => {
  try {
    if (!hasSqlDriver()) return { success: false, error: 'SQL baglanti kutuphanesi yuklenemedi' };
    const TYPES = getSqlParamTypes();
    const sanitized = (username || '').trim().toLowerCase();
    if (sanitized === 'admin' || sanitized === 'adm') {
      return { success: true, email: DEFAULT_SQL_ADMIN_EMAIL };
    }
    const rows = await runSql(
      `SELECT TOP 1 u.email FROM app_users u LEFT JOIN profiles p ON p.id = u.id
       WHERE u.email = @exact OR u.email LIKE @pattern1 OR u.email LIKE @pattern2
         OR LOWER(p.full_name) = @sanitized OR UPPER(p.full_name) = @upperName
       ORDER BY u.created_at`,
      {
        exact: { type: TYPES.NVarChar, value: sanitized + '@shefpos.local' },
        pattern1: { type: TYPES.NVarChar, value: sanitized + '@%.shefpos.local' },
        pattern2: { type: TYPES.NVarChar, value: sanitized + '@%' },
        sanitized: { type: TYPES.NVarChar, value: sanitized },
        upperName: { type: TYPES.NVarChar, value: (username || '').trim().toUpperCase() },
      }
    );
    const row = rows && rows[0];
    return { success: true, email: row ? row.email : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/** INSERT/UPDATE: bilinmeyen kolonlari at (PostgREST fazla alan gonderir, SQL Server reddeder). */
const SQL_ROW_ALLOWLIST = {
  categories: ['id', 'tenant_id', 'name', 'color', 'sort_order', 'display_order', 'image_url', 'vat_rate', 'hugin_department_id', 'hugin_vat_department', 'created_at'],
  products: ['id', 'tenant_id', 'category_id', 'name', 'description', 'barcode', 'price', 'cost', 'stock_quantity', 'unit', 'tax_rate', 'is_active', 'is_available', 'image_url', 'printer_name', 'scale_enabled', 'plu_code', 'scale_prefix', 'created_at', 'updated_at'],
  product_variants: ['id', 'tenant_id', 'product_id', 'name', 'price_modifier', 'sort_order', 'is_active', 'created_at', 'updated_at'],
  order_items: ['id', 'order_id', 'tenant_id', 'product_id', 'variant_id', 'quantity', 'unit_price', 'tax_rate', 'discount_amount', 'total_amount', 'notes', 'variant_name', 'status', 'cancellation_reason', 'cancelled_by', 'cancelled_at', 'paid_quantity', 'paid_at', 'created_at'],
  tenants: ['id', 'name', 'slug', 'address', 'phone', 'email', 'logo_url', 'subscription_status', 'subscription_plan', 'subscription_expires_at', 'max_branches', 'notes', 'onboarding_completed', 'deployment_mode', 'printer_settings', 'require_cancel_reason', 'lock_pin', 'ip_lock_enabled', 'created_at'],
  branches: ['id', 'tenant_id', 'name', 'address', 'phone', 'is_active', 'is_main', 'created_at'],
  orders: ['id', 'tenant_id', 'branch_id', 'table_id', 'order_number', 'order_type', 'order_subtype', 'status', 'payment_status', 'payment_method', 'subtotal', 'tax_amount', 'discount_amount', 'total_amount', 'notes', 'waiter_id', 'waiter_name', 'created_by', 'created_at', 'updated_at', 'completed_at', 'paid_at', 'session_id', 'customer_id', 'customer_name', 'customer_phone', 'customer_address', 'delivery_address', 'delivery_note', 'courier_id', 'courier_name', 'estimated_delivery_minutes'],
  payment_transactions: ['id', 'tenant_id', 'order_id', 'payment_method', 'amount', 'notes', 'created_at', 'created_by'],
  customer_transactions: ['id', 'tenant_id', 'customer_id', 'order_id', 'type', 'amount', 'description', 'created_by', 'created_at'],
  customers: ['id', 'tenant_id', 'name', 'phone', 'email', 'address', 'tax_number', 'credit_limit', 'current_balance', 'is_active', 'notes', 'created_at', 'updated_at'],
  cash_register_transactions: ['id', 'tenant_id', 'branch_id', 'transaction_type', 'payment_method', 'amount', 'reference_id', 'reference_type', 'description', 'order_number', 'table_name', 'notes', 'created_at', 'created_by', 'shift_id'],
  restaurant_tables: ['id', 'tenant_id', 'branch_id', 'table_number', 'status', 'capacity', 'size', 'group_id', 'current_order_id', 'session_start', 'payment_locked', 'payment_locked_at', 'payment_locked_by_session', 'payment_lock_expires_at', 'created_at'],
  table_groups: ['id', 'tenant_id', 'branch_id', 'name', 'prefix', 'color', 'created_at'],
  print_settings: ['id', 'tenant_id', 'branch_id', 'settings', 'updated_by', 'updated_at', 'created_at'],
  branch_product_stocks: ['id', 'tenant_id', 'branch_id', 'product_id', 'quantity', 'updated_at'],
  stock_movements: ['id', 'tenant_id', 'product_id', 'movement_type', 'quantity', 'unit_cost', 'total_cost', 'supplier_name', 'note', 'created_by', 'source_branch_id', 'target_branch_id', 'reference_type', 'reference_no', 'created_at'],
  order_cancel_logs: ['id', 'tenant_id', 'branch_id', 'order_id', 'order_item_id', 'order_number', 'product_name', 'quantity', 'unit_price', 'cancel_reason', 'cancelled_by', 'cancelled_by_name', 'created_at'],
  roles: ['id', 'tenant_id', 'name', 'permissions', 'created_at'],
  profiles: ['id', 'tenant_id', 'branch_id', 'role_id', 'email', 'full_name', 'role', 'avatar_url', 'is_super_admin', 'onboarding_completed', 'allowed_ips', 'created_at'],
  app_users: ['id', 'email', 'password_hash', 'tenant_id', 'created_at'],
  shift_definitions: ['id', 'tenant_id', 'branch_id', 'shift_no', 'name', 'start_time', 'end_time', 'color', 'is_active', 'created_at', 'updated_at'],
  shifts: ['id', 'tenant_id', 'branch_id', 'shift_definition_id', 'shift_no', 'shift_name', 'business_date', 'terminal_id', 'terminal_name', 'opened_by', 'opened_at', 'opening_cash', 'opening_cash_breakdown', 'opening_notes', 'closed_by', 'closed_at', 'closing_cash', 'closing_cash_breakdown', 'closing_notes', 'cash_revenue', 'card_revenue', 'open_account_revenue', 'total_revenue', 'expense_total', 'cash_in_total', 'cash_out_total', 'expected_cash', 'cash_difference', 'order_count', 'status', 'created_at', 'updated_at'],
  shift_definitions: ['id', 'tenant_id', 'branch_id', 'shift_no', 'name', 'start_time', 'end_time', 'color', 'is_active', 'created_at', 'updated_at'],
  daily_closures: ['id', 'tenant_id', 'branch_id', 'business_date', 'closed_by', 'closed_at', 'notes', 'status'],
  ingredients: ['id', 'tenant_id', 'branch_id', 'name', 'unit', 'current_stock', 'min_stock', 'unit_cost', 'default_supplier_id', 'barcode', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'],
  recipes: ['id', 'tenant_id', 'product_id', 'variant_id', 'ingredient_id', 'quantity', 'unit', 'note', 'created_at'],
  suppliers: ['id', 'tenant_id', 'branch_id', 'name', 'contact_name', 'phone', 'email', 'address', 'tax_no', 'current_balance', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'],
  purchase_invoices: ['id', 'tenant_id', 'branch_id', 'supplier_id', 'invoice_no', 'invoice_date', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount', 'payment_method', 'notes', 'status', 'created_by', 'created_at', 'updated_at'],
  purchase_invoice_items: ['id', 'invoice_id', 'tenant_id', 'ingredient_id', 'quantity', 'unit_cost', 'total', 'created_at'],
  ingredient_movements: ['id', 'tenant_id', 'ingredient_id', 'movement_type', 'quantity', 'unit_cost', 'reference_type', 'reference_id', 'note', 'created_by', 'created_at'],
  waiters: ['id', 'tenant_id', 'phone', 'pin', 'name', 'status', 'created_at', 'updated_at'],
  waiter_calls: ['id', 'tenant_id', 'branch_id', 'table_label', 'call_type', 'message', 'status', 'created_at', 'resolved_at', 'resolved_by'],
  delivery_customers: ['id', 'tenant_id', 'name', 'phone', 'address', 'notes', 'created_at'],
  couriers: ['id', 'tenant_id', 'branch_id', 'full_name', 'phone', 'pin', 'status', 'is_active', 'latitude', 'longitude', 'created_at'],
  online_orders: ['id', 'tenant_id', 'branch_id', 'platform_id', 'external_id', 'status', 'customer_name', 'customer_phone', 'delivery_address', 'total_amount', 'notes', 'created_at'],
  online_order_platforms: ['id', 'tenant_id', 'branch_id', 'platform', 'is_active', 'settings', 'created_at'],
  online_order_items: ['id', 'order_id', 'tenant_id', 'product_name', 'quantity', 'unit_price', 'total_price', 'notes'],
  expenses: ['id', 'tenant_id', 'branch_id', 'amount', 'description', 'category', 'created_by', 'created_at'],
  cash_registers: ['id', 'tenant_id', 'branch_id', 'name', 'is_active', 'created_at'],
  cash_movements: ['id', 'tenant_id', 'cash_register_id', 'movement_type', 'amount', 'description', 'created_by', 'created_at'],
  tenant_licenses: ['id', 'tenant_id', 'license_key', 'status', 'expires_at', 'created_at'],
};

function pickSqlRow(table, row) {
  if (!row || typeof row !== 'object') return row;
  const src = { ...row };
  if (table === 'customer_transactions') {
    if (src.note != null && src.description == null) src.description = src.note;
    delete src.note;
  }
  const allowed = SQL_ROW_ALLOWLIST[table];
  if (!allowed) return src;
  const set = new Set(allowed);
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || !set.has(k)) continue;
    // INSERT: opsiyonel null kolonlari gonderme (DB'de kolon yoksa patch oncesi hata verir)
    if (v === null && (k === 'hugin_department_id' || k === 'vat_rate' || k === 'variant_id' || k === 'description' || k === 'image_url' || k === 'barcode' || k === 'printer_name' || k === 'plu_code' || k === 'scale_prefix')) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * SQL Server: orders / payment_transactions uzerinde trigger varken
 * OUTPUT INSERTED.* kullanilamaz. Bulut (Supabase) bu kodu kullanmaz.
 */
async function sqlSelectRowById(table, id, cfg) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const tedious = getTedious();
  const params = { rid: { type: tedious?.TYPES?.UniqueIdentifier, value: id } };
  const rows = await runSql(`SELECT * FROM ${safeTable} WHERE id = @rid`, params, cfg);
  return rows && rows[0] ? rows[0] : null;
}

async function sqlInsertRowSafe(table, filteredRow, cfg) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const safeId = (c) => c.replace(/[^a-zA-Z0-9_]/g, '');
  const keys = Object.keys(filteredRow);
  const params = {};
  keys.forEach((k, i) => addTediousParam(params, `i${i}`, filteredRow[k]));
  const colList = keys.map((k) => safeId(k)).join(', ');
  const valList = keys.map((_, i) => `@i${i}`).join(', ');
  await runSql(`INSERT INTO ${safeTable} (${colList}) VALUES (${valList})`, params, cfg);
  return sqlSelectRowById(safeTable, filteredRow.id, cfg);
}

async function sqlUpdateRowsSafe(table, data, filters, cfg) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const safeId = (c) => c.replace(/[^a-zA-Z0-9_]/g, '');
  const params = {};
  const entries = Object.entries(data || {}).filter(([, v]) => v !== undefined);
  entries.forEach(([k, v], i) => addTediousParam(params, `u${i}`, v));
  const setClauses = entries.map(([k], i) => `${safeId(k)} = @u${i}`).join(', ');
  if (!setClauses) return [];
  const where = buildWhereTedious(filters, params, 'w');
  const idRows = await runSql(`SELECT id FROM ${safeTable} ${where}`.trim(), params, cfg);
  if (!idRows || idRows.length === 0) return [];
  await runSql(`UPDATE ${safeTable} SET ${setClauses} ${where}`.trim(), params, cfg);
  const inParams = {};
  const placeholders = idRows.map((row, i) => {
    addTediousParam(inParams, `rid${i}`, row.id);
    return `@rid${i}`;
  });
  return runSql(`SELECT * FROM ${safeTable} WHERE id IN (${placeholders.join(', ')})`, inParams, cfg);
}

async function sqlDeleteRowsSafe(table, filters, cfg) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const params = {};
  const where = buildWhereTedious(filters, params, 'w');
  const snapshot = await runSql(`SELECT * FROM ${safeTable} ${where}`.trim(), params, cfg);
  await runSql(`DELETE FROM ${safeTable} ${where}`.trim(), params, cfg);
  return snapshot || [];
}

async function sqlUpsertRowSafe(table, clean, cfg) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  const tedious = getTedious();
  const exists = await runSql(
    `SELECT TOP 1 id FROM ${safeTable} WHERE id = @id`,
    { id: { type: tedious?.TYPES?.UniqueIdentifier, value: clean.id } },
    cfg,
  );
  if (exists && exists.length > 0) {
    return (
      await sqlUpdateRowsSafe(
        safeTable,
        clean,
        [{ col: 'id', op: 'eq', val: clean.id }],
        cfg,
      )
    )[0] || null;
  }
  return sqlInsertRowSafe(safeTable, clean, cfg);
}

ipcMain.handle('sql-query', async (_, { table, operation, select, filters, orderBy, limitVal, data, countOnly, headOnly }) => {
  try {
    if (!getMssql() && !getTedious()) return { data: null, error: 'SQL kutuphanesi yuklenemedi' };
    const safeIdentifier = (c) => c.replace(/[^a-zA-Z0-9_]/g, '');
    const safeSelectCols = (s) => {
      if (!s || s === '*') return '*';
      return s.split(',').map(col => {
        const trimmed = col.trim();
        if (trimmed === '*') return '*';
        return safeIdentifier(trimmed);
      }).filter(Boolean).join(', ') || '*';
    };
    const settings = loadSettings();
    const cfg = settings.sqlServerConfig;
    if (!cfg) return { data: null, error: 'SQL Server yapılandırması bulunamadı' };

    if (operation === 'select') {
      if (countOnly) {
        const params = {};
        const where = buildWhereTedious(filters, params, 'w');
        const q = `SELECT COUNT(*) AS cnt FROM ${safeIdentifier(table)} ${where}`.trim();
        const rows = await runSql(q, params, cfg);
        const cnt = rows && rows[0] ? Number(rows[0].cnt ?? rows[0].CNT ?? 0) : 0;
        return { data: headOnly ? null : [], count: cnt, error: null };
      }
      const hasJoin = select && /\w+\s*\(/.test(select);
      if (hasJoin) {
        const rows = await execSelectWithJoins(table, select, filters, orderBy, limitVal, cfg);
        return { data: rows, error: null };
      }
      const params = {};
      const where = buildWhereTedious(filters, params, 'w');
      const cols = safeSelectCols(select);
      const order = orderBy && orderBy.length > 0
        ? `ORDER BY ${orderBy.map(o => `${safeIdentifier(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`
        : '';
      const top = limitVal ? `TOP ${parseInt(limitVal, 10)}` : '';
      const parts = ['SELECT', top, cols, 'FROM', safeIdentifier(table), where, order].filter(Boolean);
      const q = parts.join(' ').trim();
      const rows = await runSql(q, params, cfg);
      return { data: rows, error: null };
    }

    if (operation === 'insert') {
      const rowArr = Array.isArray(data) ? data : [data];
      const results = [];
      for (const row of rowArr) {
        const filteredRow = pickSqlRow(table, row) || {};
        if (!filteredRow.id) filteredRow.id = require('crypto').randomUUID();
        const inserted = await sqlInsertRowSafe(table, filteredRow, cfg);
        if (inserted) results.push(inserted);
      }
      return { data: rowArr.length === 1 ? results[0] || null : results, error: null };
    }

    if (operation === 'update') {
      const picked = pickSqlRow(table, data) || {};
      const rows = await sqlUpdateRowsSafe(table, picked, filters, cfg);
      return { data: rows || [], error: null };
    }

    if (operation === 'delete') {
      const rows = await sqlDeleteRowsSafe(table, filters, cfg);
      return { data: rows || [], error: null };
    }

    if (operation === 'upsert') {
      const rowArr = Array.isArray(data) ? data : [data];
      const results = [];
      for (const row of rowArr) {
        const clean = pickSqlRow(table, row) || {};
        if (!clean.id) clean.id = require('crypto').randomUUID();
        const upserted = await sqlUpsertRowSafe(table, clean, cfg);
        if (upserted) results.push(upserted);
      }
      return { data: rowArr.length === 1 ? results[0] || null : results, error: null };
    }

    return { data: null, error: 'Bilinmeyen operasyon: ' + operation };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('sql-get-terminal-users', async () => {
  try {
    const tedious = getTedious();
    if (!tedious) return { data: null, error: 'tedious paketi yuklenemedi' };
    const query = `SELECT id, full_name, username, role, branch_id FROM profiles WHERE is_active = 1 ORDER BY full_name ASC`;
    const rows = await runSql(query, {});
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('sql-rpc', async (_, { fn, params }) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { data: null, error: 'tedious paketi yuklenemedi' };
    const settings = loadSettings();
    const cfg = settings.sqlServerConfig;
    const p = params || {};

    if (fn === 'unlock_stale_payment_locks') {
      await runSql(
        `UPDATE restaurant_tables SET payment_locked = 0, payment_locked_at = NULL,
         payment_locked_by_session = NULL, payment_lock_expires_at = NULL
         WHERE payment_locked = 1 AND (
           (payment_lock_expires_at IS NOT NULL AND payment_lock_expires_at < GETUTCDATE())
           OR (payment_locked_at IS NOT NULL AND payment_locked_at < DATEADD(minute, -4, GETUTCDATE()))
           OR (payment_locked_at IS NULL AND payment_lock_expires_at IS NULL)
         )`,
        {},
      );
      return { data: null, error: null };
    }

    if (fn === 'unlock_table_payment') {
      const tableId = String(p.table_id || p.p_table_id || '');
      if (!tableId) return { data: { success: false, error: 'table_id zorunlu' }, error: null };
      await runSql(
        `UPDATE restaurant_tables SET payment_locked = 0, payment_locked_at = NULL,
         payment_locked_by_session = NULL, payment_lock_expires_at = NULL WHERE id = @id`,
        { id: { type: tedious.TYPES.NVarChar, value: tableId } },
      );
      return { data: { success: true }, error: null };
    }

    if (fn === 'get_current_business_date') {
      const rows = await runSql(`SELECT CONVERT(varchar(10), CAST(GETDATE() AS date), 23) AS d`, {});
      const d = rows?.[0]?.d;
      return { data: d || new Date().toISOString().slice(0, 10), error: null };
    }

    if (fn === 'start_shift') {
      const branchId = String(p.p_branch_id || '');
      const tenantId = String(p.p_tenant_id || '');
      const openedBy = String(p.p_opened_by || '');
      if (!branchId || !tenantId) {
        return { data: null, error: 'branch_id ve tenant_id zorunlu' };
      }
      const bizRows = await runSql(
        `SELECT CONVERT(varchar(10), CAST(GETDATE() AS date), 23) AS d`,
        {},
      );
      const businessDate = bizRows?.[0]?.d || new Date().toISOString().slice(0, 10);
      const existing = await runSql(
        `SELECT TOP 1 * FROM shifts WHERE tenant_id = @tid AND branch_id = @bid AND status = N'open' ORDER BY opened_at DESC`,
        {
          tid: { type: tedious.TYPES.UniqueIdentifier, value: tenantId },
          bid: { type: tedious.TYPES.UniqueIdentifier, value: branchId },
        },
      );
      if (existing && existing[0]) {
        return { data: existing[0], error: null };
      }
      let shiftNo = Number(p.p_shift_no) || 1;
      let shiftName = `Vardiya ${shiftNo}`;
      let defId = p.p_shift_definition_id || null;
      if (defId) {
        const defs = await runSql(
          `SELECT TOP 1 id, shift_no, name FROM shift_definitions WHERE id = @id AND tenant_id = @tid`,
          {
            id: { type: tedious.TYPES.UniqueIdentifier, value: defId },
            tid: { type: tedious.TYPES.UniqueIdentifier, value: tenantId },
          },
        );
        if (defs && defs[0]) {
          shiftNo = Number(defs[0].shift_no) || shiftNo;
          shiftName = defs[0].name || shiftName;
          defId = defs[0].id;
        }
      }
      const newId = require('crypto').randomUUID();
      const openingCash = Number(p.p_opening_cash) || 0;
      await runSql(
        `INSERT INTO shifts (id, tenant_id, branch_id, shift_definition_id, shift_no, shift_name, business_date,
          terminal_id, terminal_name, opened_by, opening_cash, opening_notes, status)
         VALUES (@id, @tid, @bid, @defid, @sno, @sname, @bdate, @termid, @tname, @oby, @ocash, @onotes, N'open')`,
        {
          id: { type: tedious.TYPES.UniqueIdentifier, value: newId },
          tid: { type: tedious.TYPES.UniqueIdentifier, value: tenantId },
          bid: { type: tedious.TYPES.UniqueIdentifier, value: branchId },
          defid: defId
            ? { type: tedious.TYPES.UniqueIdentifier, value: defId }
            : { type: tedious.TYPES.NVarChar, value: null },
          sno: { type: tedious.TYPES.Int, value: shiftNo },
          sname: { type: tedious.TYPES.NVarChar, value: shiftName },
          bdate: { type: tedious.TYPES.NVarChar, value: businessDate },
          termid: { type: tedious.TYPES.NVarChar, value: p.p_terminal_id || null },
          tname: { type: tedious.TYPES.NVarChar, value: p.p_terminal_name || null },
          oby: openedBy
            ? { type: tedious.TYPES.UniqueIdentifier, value: openedBy }
            : { type: tedious.TYPES.NVarChar, value: null },
          ocash: { type: tedious.TYPES.Decimal, value: openingCash },
          onotes: { type: tedious.TYPES.NVarChar, value: p.p_notes || null },
        },
      );
      const row = await sqlSelectRowById('shifts', newId, cfg);
      return { data: row, error: null };
    }

    if (fn === 'close_shift') {
      const shiftId = String(p.p_shift_id || '');
      if (!shiftId) return { data: null, error: 'p_shift_id zorunlu' };
      const closingCash = Number(p.p_closing_cash) || 0;
      const closedBy = String(p.p_closed_by || '');
      const payRows = await runSql(
        `SELECT payment_method, SUM(amount) AS total FROM payment_transactions pt
         INNER JOIN orders o ON o.id = pt.order_id
         INNER JOIN shifts s ON s.id = @sid
         WHERE pt.created_at >= s.opened_at AND o.branch_id = s.branch_id
         GROUP BY payment_method`,
        { sid: { type: tedious.TYPES.UniqueIdentifier, value: shiftId } },
      );
      let cashRev = 0;
      let cardRev = 0;
      let openRev = 0;
      for (const pr of payRows || []) {
        const m = String(pr.payment_method || '');
        const t = Number(pr.total) || 0;
        if (m === 'cash') cashRev += t;
        else if (m === 'credit_card') cardRev += t;
        else if (m === 'open_account') openRev += t;
      }
      const totalRev = cashRev + cardRev + openRev;
      await runSql(
        `UPDATE shifts SET status = N'closed', closed_at = GETUTCDATE(), closing_cash = @ccash,
          closed_by = @cby, cash_revenue = @cash, card_revenue = @card, open_account_revenue = @open,
          total_revenue = @tot, expected_cash = opening_cash + @cash, cash_difference = @ccash - (opening_cash + @cash),
          order_count = (SELECT COUNT(*) FROM orders o WHERE o.branch_id = shifts.branch_id AND o.created_at >= shifts.opened_at)
         WHERE id = @sid`,
        {
          sid: { type: tedious.TYPES.UniqueIdentifier, value: shiftId },
          ccash: { type: tedious.TYPES.Decimal, value: closingCash },
          cby: closedBy
            ? { type: tedious.TYPES.UniqueIdentifier, value: closedBy }
            : { type: tedious.TYPES.NVarChar, value: null },
          cash: { type: tedious.TYPES.Decimal, value: cashRev },
          card: { type: tedious.TYPES.Decimal, value: cardRev },
          open: { type: tedious.TYPES.Decimal, value: openRev },
          tot: { type: tedious.TYPES.Decimal, value: totalRev },
        },
      );
      const row = await sqlSelectRowById('shifts', shiftId, cfg);
      return { data: row, error: null };
    }

    if (fn === 'close_business_day') {
      const branchId = String(p.p_branch_id || '');
      const tenantId = String(p.p_tenant_id || '');
      const closedBy = String(p.p_closed_by || '');
      const biz =
        p.p_business_date ||
        (await runSql(`SELECT CONVERT(varchar(10), CAST(GETDATE() AS date), 23) AS d`, {}))?.[0]?.d;
      const openCnt = await runSql(
        `SELECT COUNT(*) AS cnt FROM shifts WHERE branch_id = @bid AND status = N'open'`,
        { bid: { type: tedious.TYPES.UniqueIdentifier, value: branchId } },
      );
      if (openCnt && openCnt[0] && Number(openCnt[0].cnt) > 0) {
        return { data: null, error: 'Acik vardiya var; once vardiyalari kapatin' };
      }
      const newId = require('crypto').randomUUID();
      await runSql(
        `INSERT INTO daily_closures (id, tenant_id, branch_id, business_date, closed_by, notes, status)
         VALUES (@id, @tid, @bid, @bdate, @cby, @notes, N'closed')`,
        {
          id: { type: tedious.TYPES.UniqueIdentifier, value: newId },
          tid: { type: tedious.TYPES.UniqueIdentifier, value: tenantId },
          bid: { type: tedious.TYPES.UniqueIdentifier, value: branchId },
          bdate: { type: tedious.TYPES.NVarChar, value: biz },
          cby: closedBy
            ? { type: tedious.TYPES.UniqueIdentifier, value: closedBy }
            : { type: tedious.TYPES.NVarChar, value: null },
          notes: { type: tedious.TYPES.NVarChar, value: p.p_notes || null },
        },
      );
      const row = await sqlSelectRowById('daily_closures', newId, cfg);
      return { data: row, error: null };
    }

    return { data: null, error: `Bilinmeyen RPC: ${fn}` };
  } catch (err) {
    return { data: null, error: err.message || String(err) };
  }
});

const { handleSqlGetirCall } = require('./getirSqlBridge.cjs');

ipcMain.handle('sql-getir-call', async (_, payload) => {
  try {
    return await handleSqlGetirCall(runSql, getTedious, payload);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('sql-get-branches', async (_, { tenantId, userId, userRole }) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { data: null, error: 'tedious paketi yuklenemedi' };
    const isAdmin = userRole === 'owner' || userRole === 'admin';
    let query;
    let params;
    if (isAdmin) {
      query = `SELECT * FROM branches WHERE tenant_id = @tenantId AND is_active = 1 ORDER BY is_main DESC, name ASC`;
      params = { tenantId: { type: tedious.TYPES.NVarChar, value: tenantId } };
    } else {
      query = `SELECT b.* FROM branches b INNER JOIN profiles p ON p.branch_id = b.id WHERE b.tenant_id = @tenantId AND b.is_active = 1 AND p.id = @userId ORDER BY b.is_main DESC, b.name ASC`;
      params = {
        tenantId: { type: tedious.TYPES.NVarChar, value: tenantId },
        userId: { type: tedious.TYPES.NVarChar, value: userId },
      };
    }
    const rows = await runSql(query, params);
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater || process.env.NODE_ENV === 'development') {
    return { error: 'Güncelleme sadece production modunda çalışır' };
  }
  _manualUpdateCheckInFlight = true;
  _manualUpdateCheckUntil = Date.now() + 120_000;
  try {
    const result = await autoUpdater.checkForUpdates();
    return { version: result?.updateInfo?.version || null };
  } catch (err) {
    return { error: friendlyUpdateError(err) };
  } finally {
    setTimeout(() => { _manualUpdateCheckInFlight = false; }, 3000);
  }
});

ipcMain.handle('open-external-url', async (_evt, url) => {
  try {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return { ok: false };
    await shell.openExternal(u);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

/** Renderer IPC dinleyicileri bağlandı → ilk otomatik kontrolü güvenli gecikmeyle planla. */
ipcMain.handle('updater-listeners-ready', async () => {
  if (!autoUpdater || process.env.NODE_ENV === 'development') return false;
  if (_rendererReadyTimer != null) return true;
  _rendererReadyTimer = setTimeout(() => {
    scheduleInitialUpdaterChecks();
  }, 500);
  return true;
});

/** Mount öncesi kaçan `update-available` / `update-downloaded` olaylarını tekrar oynat. */
ipcMain.handle('get-updater-pending', async () => ({
  available: _pendingUpdateAvailablePayload,
  downloaded: _pendingUpdateDownloadedPayload,
}));

ipcMain.handle('clear-updater-downloaded-pending', async () => {
  _pendingUpdateDownloadedPayload = null;
  return true;
});

/**
 * autoUpdater hata mesajları çoğu zaman HTTP başlıklarını da içeren çok uzun
 * teknik stringler olur. Kullanıcıya bunların hiçbirini olduğu gibi göstermeyiz;
 * GitHub / repo / latest.yml gibi teknik kavramlar UI'a sızmamalı. En yaygın
 * senaryoları kısa ve müşteri dostu Türkçe ile çeviririz.
 */
function friendlyUpdateError(err) {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('network')) {
    return 'İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.';
  }
  if (lower.includes('404') || (lower.includes('latest.yml') && lower.includes('not found'))) {
    return 'Güncelleme şu anda hazırlanıyor. Lütfen daha sonra tekrar deneyin.';
  }
  return 'Güncelleme şu anda yapılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
}

ipcMain.handle('install-update', () => {
  if (!autoUpdater) return false;
  try {
    // quitAndInstall(isSilent=false, isForceRunAfter=true):
    //   - isSilent=false → NSIS installer "sessizce" gizli çalışmaz; kısa progress UI
    //     görünür (kullanıcı ekrana bakıyorsa kafa karışmasın).
    //   - isForceRunAfter=true → kurulum sonrası Sefpos.exe yeniden başlatılır.
    // Onay diyaloğu zaten renderer tarafında gösterildiği için ek pencere yok.
    quitConfirmed = true;
    autoUpdater.quitAndInstall(false, true);
    return true;
  } catch (err) {
    paLog('error', '[updater] quitAndInstall basarisiz', { message: err?.message });
    return false;
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

/** Lisans paneli uzaktan emir: kasa AppData yerel dosyaları (bulut veri değil). */
ipcMain.handle('wipe-local-data', async () => {
  try {
    const ud = app.getPath('userData');
    const names = [
      'settings.json',
      'settings.secure.json',
      'localdb.json',
      'print-agent-session.json',
      'print-agent-session.secure.json',
    ];
    for (const name of names) {
      try {
        const fp = path.join(ud, name);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {
        /* */
      }
    }
    paLog('info', '[wipe] Yerel kullanıcı verisi temizlendi', { userData: ud });
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

// Renderer dinamik olarak pencere başlığını günceller:
// "ŞefPOS — <Tenant> — <Şube> — <Kullanıcı>"
ipcMain.handle('set-window-title', (_, title) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const safe = String(title || 'ŞefPOS').slice(0, 200);
    try { mainWindow.setTitle(safe); } catch (_) {}
  }
  return true;
});

// Renderer kullanıcı çıkış akışından sonra "kapat" derse onay diyaloğu çıkmasın.
ipcMain.handle('quit-app', () => {
  quitConfirmed = true;
  app.quit();
  return true;
});

// "Sistemi yeniden başlat" — tüm pencereleri kapatıp uygulamayı temiz yeniden açar.
// (Önbellek temizleme veya ağır işlem sonrası kullanıcının "Yeniden başlat" diyebilmesi için.)
ipcMain.handle('restart-app', () => {
  quitConfirmed = true;
  app.relaunch();
  app.exit(0);
  return true;
});

ipcMain.handle('get-ip-address', async () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();

  // Prefer IPv4 addresses
  for (const name of Object.keys(interfaces)) {
    const ifaces = interfaces[name];
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'unknown';
});

/** Hugin PC Link / TPS — yerel cihaz HTTPS (self-signed ÖKC sertifikası). */
ipcMain.handle('hugin-request', async (_, opts = {}) => {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  const method = String(opts.method || 'GET').toUpperCase();
  const urlStr = String(opts.url || '');
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 12000;

  if (!urlStr) {
    return { ok: false, status: 0, body: '', error: 'URL bos' };
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (e) {
    return { ok: false, status: 0, body: '', error: `Gecersiz URL: ${e?.message || e}` };
  }

  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  const bodyStr =
    opts.body === undefined || opts.body === null
      ? ''
      : typeof opts.body === 'string'
        ? opts.body
        : JSON.stringify(opts.body);

  const headers = { ...(opts.headers || {}) };
  if (bodyStr && !headers['Content-Length'] && !headers['content-length']) {
    headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
  }

  return new Promise((resolve) => {
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    };

    const req = lib.request(reqOpts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const status = res.statusCode || 0;
        const hdrs = {};
        for (const [k, v] of Object.entries(res.headers || {})) {
          if (Array.isArray(v)) hdrs[String(k).toLowerCase()] = v.join(', ');
          else if (v != null) hdrs[String(k).toLowerCase()] = String(v);
        }
        resolve({
          ok: status >= 200 && status < 300,
          status,
          body: data,
          headers: hdrs,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '', error: 'Zaman asimi' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, body: '', error: err?.message || 'Baglanti hatasi' });
    });

    if (bodyStr && method !== 'GET' && method !== 'HEAD') {
      req.write(bodyStr);
    }
    req.end();
  });
});

ipcMain.handle('get-mac-address', async () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        iface.mac &&
        iface.mac !== '00:00:00:00:00:00'
      ) {
        return iface.mac.toUpperCase();
      }
    }
  }
  return '';
});

ipcMain.handle('get-device-fingerprint', async () => {
  const os = require('os');
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');

  // Try to get MAC address (most reliable)
  const interfaces = os.networkInterfaces();
  let macAddress = '';
  for (const name of Object.keys(interfaces)) {
    const ifaces = interfaces[name];
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        macAddress = iface.mac;
        break;
      }
    }
    if (macAddress) break;
  }

  // Combine with hostname for unique fingerprint
  const hostname = os.hostname();
  const combined = `${hostname}:${macAddress}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  return hash;
});

const { registerHybridSyncIpc } = require('./hybridSync.cjs');
registerHybridSyncIpc({
  ipcMain,
  loadSettings,
  saveSettings,
  runSql,
  getSqlParamTypes,
  writeSecureJson,
  settingsSecurePath,
  pickSqlRow,
  applySqlSchemaPatches,
  normalizeSqlServerConfig,
  ensureDefaultAdminUser,
});

app.whenReady().then(() => {
  terminateOtherMainSefposProcesses();
  try {
    const { session } = require('electron');
    const appDistDir = path.join(app.getAppPath(), 'dist');
    installElectronContentSecurityPolicy(session.fromPartition('persist:shefpos'), {
      isDev,
      devPort: readSefposDevServerPort(),
      appDistDir,
    });
  } catch (cspErr) {
    console.warn('[csp] Content-Security-Policy kurulamadı:', cspErr?.message || cspErr);
  }
  startPrintAgent();
  if (isElectronSqlServerMode()) {
    try {
      const norm = normalizeSqlServerConfig(loadSettings().sqlServerConfig);
      void applySqlSchemaPatches(norm)
        .then((patch) => {
          paLog(
            'info',
            `[sql-patch] acilis: ${patch.executed} batch` +
              (patch.errors.length ? `, ${patch.errors.length} uyari` : ''),
          );
        })
        .catch((e) => paLog('error', '[sql-patch] acilis hata', e?.message || e));
    } catch (e) {
      paLog('error', '[sql-patch] acilis config', e?.message || e);
    }
  }
  createWindow();
  setupAutoUpdater();
  initCidListener();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let cidListener = null;
let cidAutoStartArmed = false;

function initCidListener() {
  if (cidListener) return;
  try {
    const { CidListener } = require('./cidListener.cjs');
    cidListener = new CidListener();
  } catch (e) {
    console.warn('[CallerID] modül yüklenemedi:', e?.message || e);
    return;
  }

  cidListener.onCall = (payload) => {
    try {
      mainWindow?.webContents.send('caller-id-ring', payload);
    } catch (e) {
      console.error('[CallerID] ring forward error:', e);
    }
  };
  cidListener.onSignal = (payload) => {
    try {
      mainWindow?.webContents.send('caller-id-signal', payload);
    } catch (e) {
      console.error('[CallerID] signal forward error:', e);
    }
  };
  cidListener.onError = (err) => {
    console.error('[CallerID] error:', err?.message || err);
    try {
      mainWindow?.webContents.send('caller-id-error', { message: String(err?.message || err) });
    } catch {
      /* yoksay */
    }
  };
}

ipcMain.handle('caller-id-status', () => {
  if (!cidListener) return { available: false, running: false };
  return cidListener.status();
});

ipcMain.handle('caller-id-start', (_evt, opts = {}) => {
  if (!cidListener) return { ok: false, error: 'Caller ID modülü yok' };
  try {
    const status = cidListener.start({
      softTest: !!opts.softTest,
      arch: opts.arch,
      dllPath: opts.dllPath,
    });
    cidAutoStartArmed = true;
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('caller-id-stop', () => {
  if (!cidListener) return { ok: false };
  try {
    cidListener.stop();
    cidAutoStartArmed = false;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

app.on('before-quit', () => {
  try {
    if (cidListener && cidListener.isRunning()) cidListener.stop();
  } catch {
    /* yoksay */
  }
});

// suppress unused warning when caller-id is not active
void cidAutoStartArmed;

let scaleComPort = null;
let scaleWeighingSession = null;
const scaleBuffer = { data: '', lastUpdate: 0 };

/**
 * Terazi metninden gram çıkar (eski release ile uyumlu: ST,GS, STX/ETX, +/-, son sayı fallback).
 * Uzun satırlarda da çalışır; sadece newline ile bölünmüş parçalara uygulanmamalıdır — caller satır/chunk verir.
 */
function parseScaleChunkToGrams(chunk) {
  const clean = String(chunk || '').replace(/\u0002|\u0003/g, '').trim();
  if (!clean) return null;

  const kgMatch = clean.match(/([+-]?\d+(?:[.,]\d+)?)\s*kg/i);
  if (kgMatch) {
    const v = parseFloat(kgMatch[1].replace(',', '.'));
    if (!Number.isNaN(v)) return v * 1000;
  }

  const gMatch = clean.match(/([+-]?\d+(?:[.,]\d+)?)\s*g(?!r)/i);
  if (gMatch) {
    const v = parseFloat(gMatch[1].replace(',', '.'));
    if (!Number.isNaN(v)) return v;
  }

  const nums = clean.match(/([+-]?\d+(?:[.,]\d+)?)/g);
  if (!nums || nums.length === 0) return null;
  const lastToken = String(nums[nums.length - 1]);
  const last = parseFloat(lastToken.replace(',', '.'));
  if (Number.isNaN(last)) return null;
  if (lastToken.includes('.') || lastToken.includes(',')) {
    return last * 1000;
  }
  return last;
}

/** Satır sonu gelmeden tamponun sonunda tam bir kg / g çerçevesi varsa oku */
function tryParseSuffixWeightFrame(buf) {
  if (!buf || buf.length > 512) return null;
  let m = buf.match(/([+-]?\d+(?:[.,]\d+)?)\s*kg\s*$/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(v)) return null;
    return { grams: v * 1000, matchedLen: m[0].length };
  }
  m = buf.match(/([+-]?\d+(?:[.,]\d+)?)\s*g(?!r)\s*$/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(v)) return null;
    return { grams: v, matchedLen: m[0].length };
  }
  return null;
}

function pushScaleNetSample(sess, grossGrams) {
  const tare = sess.tareBaseGrams || 0;
  const net = Math.max(0, grossGrams - tare);
  sess.lastGrossGrams = grossGrams;
  sess.lastNetGrams = net;
  sess.lastWeight = net;

  const h = sess.history;
  const now = Date.now();
  h.push({ value: net, time: now });
  if (h.length > 5) h.shift();

  const SPREAD_G = 48;
  const STABLE_MS = 110;
  let stabilized = false;
  if (h.length >= 2) {
    const vals = h.map((x) => x.value);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread <= SPREAD_G) {
      if (!sess.stableSince) sess.stableSince = now;
      stabilized = now - sess.stableSince >= STABLE_MS;
    } else {
      sess.stableSince = null;
      stabilized = false;
    }
  } else {
    sess.stableSince = null;
  }
  sess.stabilized = stabilized;

  const stabChanged = sess.lastIpcStabilized !== stabilized;
  const elapsed = now - (sess.lastIpcAt || 0);
  const netDelta = sess.lastIpcNet == null ? Infinity : Math.abs(net - sess.lastIpcNet);
  if (!stabChanged && elapsed < 90 && netDelta < 8) {
    return;
  }
  sess.lastIpcAt = now;
  sess.lastIpcNet = net;
  sess.lastIpcStabilized = stabilized;

  mainWindow?.webContents.send('scale-weight-update', {
    weight: net,
    stabilized: sess.stabilized,
    timestamp: now,
  });
}

ipcMain.handle('scale-list-ports', async () => {
  try {
    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch {
      return [];
    }
    const ports = await SerialPort.list();
    const normalized = (ports || [])
      .filter((p) => !!p.path)
      .map((p) => ({
        path: p.path,
        name: p.friendlyName || p.manufacturer || p.path,
        manufacturer: p.manufacturer || null,
        serialNumber: p.serialNumber || null,
      }));
    if (normalized.length > 0) return normalized;

    if (process.platform === 'win32') {
      return Array.from({ length: 16 }, (_, i) => {
        const n = i + 1;
        return { path: `COM${n}`, name: `COM${n}` };
      });
    }
    return [];
  } catch {
    return [];
  }
});

function closeScaleWeighingPortAsync(portInstance) {
  return new Promise((resolve) => {
    if (!portInstance) return resolve();
    try {
      if (portInstance.isOpen) {
        portInstance.close(() => resolve());
      } else {
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

ipcMain.handle('scale-start-weighing', async (_, { port, baudRate = 9600 }) => {
  let scalePort;
  try {
    if (scaleWeighingSession) {
      const prevPort = scaleWeighingSession.port;
      scaleWeighingSession = null;
      await closeScaleWeighingPortAsync(prevPort);
      await new Promise((r) => setTimeout(r, 200));
    }

    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch {
      return { error: 'SerialPort module required: npm install serialport' };
    }

    scalePort = new SerialPort({
      path: port,
      baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false,
    });
    scaleBuffer.data = '';
    scaleBuffer.lastUpdate = 0;

    const session = {
      port: scalePort,
      startTime: Date.now(),
      lastGrossGrams: null,
      lastWeight: null,
      lastNetGrams: null,
      stabilized: false,
      /** Son N net gram ölçümü — sadece kararlılık için */
      history: [],
      tareBaseGrams: 0,
      stableSince: null,
      /** IPC seyreltme — aşırı setState / GPU titremesini önler */
      lastIpcAt: 0,
      lastIpcNet: null,
      lastIpcStabilized: undefined,
    };

    scalePort.on('data', (data) => {
      if (scaleWeighingSession !== session) return;
      const str = data.toString();
      scaleBuffer.data += str;
      scaleBuffer.lastUpdate = Date.now();

      if (scaleBuffer.data.length > 8192) {
        scaleBuffer.data = scaleBuffer.data.slice(-4096);
      }

      let normalized = scaleBuffer.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const parts = normalized.split('\n');
      let incomplete = parts.pop() || '';

      let lastGrossThisChunk = null;
      for (const line of parts) {
        const g = parseScaleChunkToGrams(line);
        if (g !== null && !Number.isNaN(g) && g >= 0 && g <= 500000) {
          lastGrossThisChunk = g;
        }
      }

      if (lastGrossThisChunk !== null) {
        pushScaleNetSample(session, lastGrossThisChunk);
      }

      const suffix = tryParseSuffixWeightFrame(incomplete);
      if (suffix) {
        if (suffix.grams >= 0 && suffix.grams <= 500000) {
          pushScaleNetSample(session, suffix.grams);
        }
        incomplete = incomplete.slice(0, incomplete.length - suffix.matchedLen);
      }

      // Bazı cihazlar satır sonu göndermez; eski release gibi uzun tamponda bir kez dene.
      if (incomplete.length > 40) {
        const g = parseScaleChunkToGrams(incomplete);
        if (g !== null && !Number.isNaN(g) && g >= 0 && g <= 500000) {
          pushScaleNetSample(session, g);
          incomplete = '';
        }
      }

      scaleBuffer.data = incomplete.slice(-2048);
    });

    scalePort.on('error', (err) => {
      console.error('Scale port error:', err);
      mainWindow?.webContents.send('scale-weighing-error', { error: err.message });
      if (scaleWeighingSession === session) {
        scaleWeighingSession = null;
        try {
          if (scalePort.isOpen) scalePort.close(() => {});
        } catch {}
      }
    });

    await new Promise((resolve, reject) => {
      scalePort.open((openErr) => (openErr ? reject(openErr) : resolve()));
    });

    scaleWeighingSession = session;
    return { success: true, port, sessionId: Date.now() };
  } catch (err) {
    scaleWeighingSession = null;
    const msg = err?.message || String(err);
    try {
      if (scalePort && scalePort.isOpen) {
        await closeScaleWeighingPortAsync(scalePort);
      }
    } catch {}
    mainWindow?.webContents.send('scale-weighing-error', { error: msg });
    return { error: msg };
  }
});

function scalePortWriteDrain(port, buf, timeoutMs = 400) {
  return new Promise((resolve) => {
    const finish = () => resolve();
    if (!buf || !buf.length) return finish();
    const t = setTimeout(finish, timeoutMs);
    port.write(buf, (wErr) => {
      if (wErr) {
        clearTimeout(t);
        return finish();
      }
      try {
        port.drain(() => {
          clearTimeout(t);
          finish();
        });
      } catch {
        clearTimeout(t);
        finish();
      }
    });
  });
}

/** Yeni tartım / ürün değişiminde yazılım 0 + çoğu RS232 terazide donanım dara (özel hex veya varsayılan T+CRLF) */
ipcMain.handle('scale-initial-zero', async (_, opts = {}) => {
  try {
    if (!scaleWeighingSession?.port?.isOpen) {
      return { success: false, error: 'Terazi oturumu yok' };
    }
    const sess = scaleWeighingSession;
    sess.history = [];
    sess.stableSince = null;
    sess.stabilized = false;
    sess.tareBaseGrams = 0;
    sess.lastNetGrams = 0;
    sess.lastWeight = 0;
    sess.lastIpcAt = 0;
    sess.lastIpcNet = null;
    sess.lastIpcStabilized = undefined;

    const disableHardwareTare = opts.disableHardwareTare === true;
    const hex = typeof opts?.tareCommandHex === 'string' ? opts.tareCommandHex.trim() : '';

    await new Promise((r) => setTimeout(r, 60));

    if (!disableHardwareTare) {
      let buf = null;
      if (hex.length >= 2 && /^[0-9a-fA-F\s]+$/.test(hex)) {
        try {
          buf = Buffer.from(hex.replace(/\s+/g, ''), 'hex');
        } catch (_) {
          buf = null;
        }
      }
      if (!buf || !buf.length) {
        buf = Buffer.from('T\r\n', 'ascii');
      }
      try {
        await scalePortWriteDrain(sess.port, buf);
      } catch (_) {
        /* bazı sürücüler drain farklı davranır; yine de yazılım sıfırı uygulanır */
      }
    }

    mainWindow?.webContents.send('scale-weight-update', {
      weight: 0,
      stabilized: false,
      timestamp: Date.now(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('scale-tare-weighing', () => {
  try {
    if (!scaleWeighingSession) {
      return { success: false, error: 'Terazi oturumu yok' };
    }
    const gross = scaleWeighingSession.lastGrossGrams;
    if (gross == null || Number.isNaN(gross)) {
      return { success: false, error: 'Teraziden veri yok; bir an bekleyip tekrar deneyin' };
    }
    scaleWeighingSession.tareBaseGrams = gross;
    scaleWeighingSession.history = [];
    scaleWeighingSession.stableSince = null;
    scaleWeighingSession.stabilized = false;
    scaleWeighingSession.lastNetGrams = 0;
    scaleWeighingSession.lastWeight = 0;
    scaleWeighingSession.lastIpcAt = 0;
    scaleWeighingSession.lastIpcNet = null;
    scaleWeighingSession.lastIpcStabilized = undefined;
    mainWindow?.webContents.send('scale-weight-update', {
      weight: 0,
      stabilized: false,
      timestamp: Date.now(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('scale-stop-weighing', async () => {
  try {
    const sess = scaleWeighingSession;
    const result = sess?.lastWeight ?? null;
    const p = sess?.port;
    scaleWeighingSession = null;
    await closeScaleWeighingPortAsync(p);
    return { success: true, weight: result };
  } catch (err) {
    scaleWeighingSession = null;
    return { error: err.message };
  }
});

ipcMain.handle('scale-get-weight', () => {
  if (!scaleWeighingSession) return { error: 'No weighing session' };
  return {
    weight: scaleWeighingSession.lastNetGrams ?? scaleWeighingSession.lastWeight,
    stabilized: scaleWeighingSession.stabilized,
    history: scaleWeighingSession.history.slice(-5)
  };
});

app.on('window-all-closed', () => {
  // Windows: pencere gizlemek yerine uygulamayi tamamen kapat. Gizli proses
  // (Gorev Yoneticisi'nde gorunur ama tiklayinca acilmaz) kullanici kafa
  // karisikligina yol aciyordu; Print Agent yeniden baslatmayla gelir.
  if (process.platform === 'win32') {
    quitConfirmed = true;
    app.quit();
    return;
  }

  if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
  if (realtimeWs) { try { realtimeWs.close(); } catch {} }
  if (printAgentServer) {
    printAgentServer.close();
  }
  if (scaleComPort) {
    try { scaleComPort.close(); } catch {}
  }
  closeSqlPool();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
