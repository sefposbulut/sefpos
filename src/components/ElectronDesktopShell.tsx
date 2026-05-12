import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Download, Sparkles, X, RefreshCcw, AlertTriangle } from 'lucide-react';

/**
 * Electron'da uygulamayı "gerçek bir masaüstü uygulaması" gibi hissettiren
 * yardımcı katman. Çoğu yan etki; ayrıca üç UI öğesi render eder:
 *
 *   1) **Güncelleme toast'ı** — indiriliyor, hazır, hata durumları için sağ
 *      alt köşede görünür.
 *   2) **Güncelleme onay modali** — kullanıcı oturum açıkken yeni sürüm
 *      indirildiğinde "Şimdi yükle / Sonra" tercihi sunulur. Oturum açık
 *      değilse (login ekranı görünürken) onay sormadan, sessizce yükleme
 *      otomatik başlatılır → müşteri masada müşteriyle uğraşırken işine
 *      karışılmaz.
 *   3) **"Yenilikler" modali** — kurulum tamamlandıktan sonra Sefpos.exe
 *      yeniden açıldığında, daha önce gösterilmemiş release notes varsa
 *      kullanıcıya tek seferlik özet ekranı gösterilir.
 *
 * Web build'de tüm Electron API çağrıları sessizce no-op olur.
 */
type UpdatePayload = {
  version?: string;
  releaseNotes?: string;
  releaseName?: string;
};

type ProgressPayload = {
  percent?: number;
};

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'progress'; percent: number; version: string }
  | { kind: 'ready'; version: string; releaseNotes: string; releaseName: string }
  | { kind: 'error'; message: string };

const RELEASE_NOTES_SEEN_KEY = 'sefpos_release_notes_seen_version';
const PENDING_RELEASE_NOTES_KEY = 'sefpos_pending_release_notes';
const PENDING_RELEASE_VERSION_KEY = 'sefpos_pending_release_version';

/** Sade markdown → düz metin temizliği (release notes sade görünsün). */
function tidyReleaseNotes(raw: string | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/\r/g, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function ElectronDesktopShell() {
  const { tenant, activeBranch, profile, user } = useAuth();
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' });
  const [toastDismissed, setToastDismissed] = useState(false);

  // "Şimdi yükle / Sonra" onay modali (kullanıcı oturum açıkken).
  const [confirmReady, setConfirmReady] = useState<null | {
    version: string;
    releaseNotes: string;
    releaseName: string;
  }>(null);

  // İlk açılışta gösterilecek "Yenilikler" modali (kurulumdan sonra ilk run).
  const [whatsNew, setWhatsNew] = useState<null | { version: string; notes: string }>(null);

  // Kullanıcı oturumu açık mı? (Auth ekranı görünürken false sayılır.)
  const userLoggedIn = !!user;
  const userLoggedInRef = useRef(userLoggedIn);
  useEffect(() => {
    userLoggedInRef.current = userLoggedIn;
  }, [userLoggedIn]);

  // Dinamik pencere başlığı.
  useEffect(() => {
    const tenantName = tenant?.name || '';
    const branchName = activeBranch?.name || '';
    const userName = profile?.full_name || user?.email?.split('@')[0] || '';
    const parts = ['ŞefPOS'];
    if (tenantName) parts.push(tenantName);
    if (branchName) parts.push(branchName);
    if (userName) parts.push(userName);
    const title = parts.join(' — ');

    try { document.title = title; } catch (_) {}

    const api = (window as any).electronAPI;
    if (api?.setWindowTitle) {
      api.setWindowTitle(title).catch(() => {});
    }
  }, [tenant, activeBranch, profile, user]);

  // Print Agent loglarını DevTools Console'a yansıt (saha tanısı için).
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onPrintAgentLog) return;
    const off = api.onPrintAgentLog((payload: any) => {
      const ts = payload?.ts ? new Date(payload.ts).toLocaleTimeString() : '';
      const tag = `[print-agent ${ts}]`;
      const msg = payload?.message || '';
      const extra = payload?.extra ?? null;
      const args = extra !== null ? [tag, msg, extra] : [tag, msg];
      if (payload?.level === 'error') console.error(...args);
      else if (payload?.level === 'warn') console.warn(...args);
      else console.log(...args);
    });
    return () => { try { typeof off === 'function' && off(); } catch {} };
  }, []);

  // Açılışta: bu sürümün release notes'u daha önce gösterilmediyse
  // "Yenilikler" modalını aç. Notlar son kurulum sırasında pending olarak
  // kaydedilmiş olur (update-downloaded → setItem). Hiç pending yoksa
  // (yani uygulama temiz kurulduysa) modal açılmaz.
  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    (async () => {
      const api = (window as any).electronAPI;
      let currentVersion = '';
      try {
        currentVersion = (await api?.getAppVersion?.()) || '';
      } catch {
        currentVersion = '';
      }
      if (cancelled || !currentVersion) return;

      let pendingVersion = '';
      let pendingNotes = '';
      try {
        pendingVersion = localStorage.getItem(PENDING_RELEASE_VERSION_KEY) || '';
        pendingNotes = localStorage.getItem(PENDING_RELEASE_NOTES_KEY) || '';
      } catch {}

      const lastShown = (() => {
        try { return localStorage.getItem(RELEASE_NOTES_SEEN_KEY) || ''; } catch { return ''; }
      })();

      // Bekleyen kayıt bu sürüme aitse ve daha gösterilmemişse modal aç.
      if (pendingVersion === currentVersion && lastShown !== currentVersion) {
        setWhatsNew({ version: currentVersion, notes: tidyReleaseNotes(pendingNotes) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isElectron]);

  // Auto-update event aboneliği.
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    if (!api?.onUpdateAvailable) return;

    api.onUpdateAvailable((info: UpdatePayload) => {
      setToastDismissed(false);
      setUpdateState({ kind: 'available', version: info?.version || '' });
    });
    api.onUpdateDownloadProgress((info: ProgressPayload) => {
      setToastDismissed(false);
      setUpdateState((prev) => ({
        kind: 'progress',
        percent: Math.max(0, Math.min(100, Math.round(info?.percent || 0))),
        version: prev.kind === 'available' || prev.kind === 'progress' ? prev.version : '',
      }));
    });
    api.onUpdateDownloaded?.((info: UpdatePayload) => {
      setToastDismissed(false);
      const version = info?.version || '';
      const releaseNotes = tidyReleaseNotes(info?.releaseNotes);
      const releaseName = info?.releaseName || '';
      setUpdateState({ kind: 'ready', version, releaseNotes, releaseName });

      // "Yenilikler" sayfasında bir sonraki açılışta göstermek için
      // pending storage'a kaydet.
      try {
        localStorage.setItem(PENDING_RELEASE_VERSION_KEY, version);
        localStorage.setItem(PENDING_RELEASE_NOTES_KEY, releaseNotes);
      } catch {}

      // Kullanıcı oturum açık → onay modali göster.
      // Kullanıcı oturumda değil → otomatik kur (müşteriye soru sormadan).
      // Auth ekranındayken müşteriler genellikle servise başlamamıştır.
      if (userLoggedInRef.current) {
        setConfirmReady({ version, releaseNotes, releaseName });
      } else {
        // Auth ekranındayken otomatik yükle; küçük gecikme ile başlat ki
        // ekran fade-out görünebilsin.
        setTimeout(() => {
          try { api.installUpdate?.(); } catch {}
        }, 1200);
      }
    });
    api.onUpdateError?.((info: { message?: string }) => {
      setToastDismissed(false);
      setUpdateState({ kind: 'error', message: String(info?.message || 'unknown') });
    });

    return () => {
      try { api.removeUpdateListeners?.(); } catch (_) {}
    };
  }, [isElectron]);

  const dismissWhatsNew = () => {
    if (!whatsNew) return;
    try {
      localStorage.setItem(RELEASE_NOTES_SEEN_KEY, whatsNew.version);
      localStorage.removeItem(PENDING_RELEASE_VERSION_KEY);
      localStorage.removeItem(PENDING_RELEASE_NOTES_KEY);
    } catch {}
    setWhatsNew(null);
  };

  const installNow = async () => {
    const api = (window as any).electronAPI;
    if (api?.installUpdate) {
      try { await api.installUpdate(); } catch (_) {}
    }
  };

  const installLater = () => {
    // Kullanıcı "Sonra" dedi → modali kapat, toast'ta hatırlatma kalsın.
    // electron-updater varsayılan olarak autoInstallOnAppQuit=true, kullanıcı
    // uygulamayı kapatınca güncelleme otomatik kurulur.
    setConfirmReady(null);
  };

  return (
    <>
      {confirmReady && (
        <div
          className="fixed inset-0 z-[2147483645] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-orange-200 overflow-hidden w-full max-w-md"
            style={{ fontFamily: 'inherit' }}
          >
            <div className="bg-gradient-to-br from-amber-400 to-orange-600 text-white p-5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" strokeWidth={2.4} />
                </div>
                <div>
                  <div className="text-lg font-extrabold">ŞefPOS güncellemesi hazır</div>
                  <div className="text-xs text-white/90">
                    {confirmReady.version
                      ? `Sürüm ${confirmReady.version} yüklemeye hazır.`
                      : 'Yeni sürüm yüklemeye hazır.'}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-700 leading-relaxed">
                Yeni özellikler, performans iyileştirmeleri ve hata düzeltmeleri eklendi. Şimdi kurulum yapılırsa ŞefPOS kısaca kapanıp yeniden açılır.
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                <strong>Not:</strong> Kurulum 10–20 saniye sürer. Açık adisyon ve siparişleriniz güvende,
                kayba uğramaz.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button
                onClick={installLater}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Sonra
              </button>
              <button
                onClick={installNow}
                className="px-4 py-2 rounded-lg text-sm font-extrabold bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow active:scale-95 hover:from-amber-600 hover:to-orange-700"
              >
                Şimdi yükle & yeniden başlat
              </button>
            </div>
          </div>
        </div>
      )}

      {whatsNew && (
        <div
          className="fixed inset-0 z-[2147483644] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-emerald-200 overflow-hidden w-full max-w-lg"
            style={{ fontFamily: 'inherit' }}
          >
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" strokeWidth={2.4} />
                </div>
                <div>
                  <div className="text-lg font-extrabold">ŞefPOS güncellendi</div>
                  <div className="text-xs text-white/90">
                    Şu an sürüm {whatsNew.version} kullanıyorsunuz.
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-700 leading-relaxed">
                Sisteminize en son iyileştirmeler ve hata düzeltmeleri uygulandı. Çalışmaya kaldığınız yerden devam edebilirsiniz.
              </div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                <li>Performans iyileştirmeleri</li>
                <li>Yazıcı ve fiş düzeninde küçük düzeltmeler</li>
                <li>Genel stabilite ve hata gidermeleri</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button
                onClick={dismissWhatsNew}
                className="px-4 py-2 rounded-lg text-sm font-extrabold bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow active:scale-95 hover:from-emerald-600 hover:to-teal-700"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {!toastDismissed && updateState.kind !== 'idle' && (
        <div
          className="fixed z-[60] right-3 md:right-5 bottom-12 md:bottom-14 max-w-[320px] rounded-xl border border-orange-300 bg-white/95 backdrop-blur shadow-2xl overflow-hidden"
          style={{ fontFamily: 'inherit' }}
        >
          <div className="flex items-start gap-2 p-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
              {updateState.kind === 'ready' ? (
                <CheckCircle2 className="w-4 h-4" strokeWidth={2.4} />
              ) : updateState.kind === 'progress' ? (
                <Download className="w-4 h-4" strokeWidth={2.4} />
              ) : updateState.kind === 'error' ? (
                <AlertTriangle className="w-4 h-4" strokeWidth={2.4} />
              ) : (
                <Sparkles className="w-4 h-4" strokeWidth={2.4} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {updateState.kind === 'available' && (
                <>
                  <div className="text-sm font-bold text-slate-800">
                    Yeni güncelleme bulundu
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {updateState.version
                      ? `Sürüm ${updateState.version} indiriliyor…`
                      : 'Güncelleme indiriliyor…'}
                  </div>
                </>
              )}
              {updateState.kind === 'progress' && (
                <>
                  <div className="text-sm font-bold text-slate-800">
                    Güncelleme indiriliyor
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                      style={{ width: `${updateState.percent}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    %{updateState.percent} tamamlandı
                  </div>
                </>
              )}
              {updateState.kind === 'ready' && (
                <>
                  <div className="text-sm font-bold text-slate-800">
                    Güncelleme hazır
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {updateState.version
                      ? `Sürüm ${updateState.version} yüklemeye hazır.`
                      : 'Yeni sürüm yüklemeye hazır.'}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={installNow}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow active:scale-95 hover:from-amber-600 hover:to-orange-700"
                    >
                      Şimdi yeniden başlat
                    </button>
                    <button
                      onClick={() => setToastDismissed(true)}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Sonra
                    </button>
                  </div>
                </>
              )}
              {updateState.kind === 'error' && (
                <>
                  <div className="text-sm font-bold text-slate-800">
                    Güncelleme şu anda yapılamadı
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 break-words">
                    İnternet bağlantınızı kontrol edip biraz sonra tekrar deneyin.
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        try { await api?.checkForUpdates?.(); } catch {}
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1"
                    >
                      <RefreshCcw className="w-3 h-3" /> Tekrar dene
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setToastDismissed(true)}
              aria-label="Kapat"
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
