import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Download, Sparkles, X } from 'lucide-react';

/**
 * Electron'da uygulamayı "gerçek bir masaüstü uygulaması" gibi hissettiren
 * yardımcı katman. Bileşen hiçbir UI render etmez (toast hariç) — yalnızca
 * yan etkiler:
 *
 * 1) **Dinamik pencere başlığı**: tenant/şube/kullanıcı her değiştiğinde
 *    "ŞefPOS — <İşletme> — <Şube> — <Kullanıcı>" şeklinde set eder.
 *    Web tarayıcısında `document.title` güncellenir; Electron varsa pencere
 *    çerçevesindeki başlık da değişir.
 *
 * 2) **Otomatik güncelleme bildirimleri**: `electron-updater` olaylarını
 *    dinleyip kullanıcıya sağ alt köşede bir kart gösterir:
 *      - "Güncelleme indiriliyor… %xx" (progress bar'lı)
 *      - "Güncelleme hazır — Şimdi yeniden başlat" (tek tıkla yükle)
 *
 * Web build'de tüm Electron API çağrıları sessizce no-op olur.
 */
export function ElectronDesktopShell() {
  const { tenant, activeBranch, profile, user } = useAuth();
  const [updateState, setUpdateState] = useState<
    | { kind: 'idle' }
    | { kind: 'available'; version: string }
    | { kind: 'progress'; percent: number }
    | { kind: 'ready'; version: string }
  >({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);

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

  // Print Agent (main process) loglarını DevTools Console'a yansıt.
  // Saha tanısında kullanıcı, register-printers, fetchPendingJobs,
  // processPrintJob gibi olayları doğrudan tarayıcı/Electron DevTools'unda
  // görebilir; Electron'u CMD'den başlatmak gerekmez.
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

  // Auto-update event aboneliği (Electron'da).
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onUpdateAvailable) return;

    api.onUpdateAvailable((info: { version?: string }) => {
      setDismissed(false);
      setUpdateState({ kind: 'available', version: info?.version || '' });
    });
    api.onUpdateDownloadProgress((info: { percent?: number }) => {
      setDismissed(false);
      setUpdateState({
        kind: 'progress',
        percent: Math.max(0, Math.min(100, Math.round(info?.percent || 0))),
      });
    });
    api.onUpdateDownloaded((info: { version?: string }) => {
      setDismissed(false);
      setUpdateState({ kind: 'ready', version: info?.version || '' });
    });

    return () => {
      try { api.removeUpdateListeners?.(); } catch (_) {}
    };
  }, []);

  if (updateState.kind === 'idle' || dismissed) return null;

  const installNow = async () => {
    const api = (window as any).electronAPI;
    if (api?.installUpdate) {
      try { await api.installUpdate(); } catch (_) {}
    }
  };

  return (
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
                  onClick={() => setDismissed(true)}
                  className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  Sonra
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Kapat"
          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
