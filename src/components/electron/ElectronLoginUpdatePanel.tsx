import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';
import { githubDirectSetupDownloadUrl } from '../../lib/desktopDownload';

type UpdateUiState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'progress'; percent: number; version: string }
  | { kind: 'ready'; version: string }
  | { kind: 'not_available' }
  | { kind: 'error'; message: string };

/** Giriş ekranı — oturum açılmadan sürüm + güncelleme (Ayarlar menüsüne gerek yok). */
export function ElectronLoginUpdatePanel() {
  const api = (window as any).electronAPI;
  const [appVersion, setAppVersion] = useState('');
  const [updateState, setUpdateState] = useState<UpdateUiState>({ kind: 'idle' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncPending = useCallback(async () => {
    if (!api?.getUpdaterPending) return;
    try {
      const pend = await api.getUpdaterPending();
      if (pend?.downloaded?.version) {
        setUpdateState({ kind: 'ready', version: String(pend.downloaded.version) });
        return;
      }
      if (pend?.available?.version) {
        setUpdateState((prev) =>
          prev.kind === 'progress' || prev.kind === 'ready'
            ? prev
            : { kind: 'available', version: String(pend.available.version) },
        );
      }
    } catch {
      /* ignore */
    }
  }, [api]);

  useEffect(() => {
    if (!api?.getAppVersion) return;
    let cancelled = false;
    void api.getAppVersion().then((v: string) => {
      if (!cancelled && v) setAppVersion(v);
    });
    void syncPending();
    return () => {
      cancelled = true;
    };
  }, [api, syncPending]);

  useEffect(() => {
    if (updateState.kind !== 'available' && updateState.kind !== 'checking') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => void syncPending(), 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [updateState.kind, syncPending]);

  const handleCheck = useCallback(async () => {
    if (!api?.checkForUpdates) {
      setUpdateState({ kind: 'error', message: 'Bu kurulum otomatik güncellemeyi desteklemiyor.' });
      return;
    }
    setUpdateState({ kind: 'checking' });
    try {
      const res = await api.checkForUpdates();
      if (res?.error) {
        setUpdateState({ kind: 'error', message: String(res.error) });
        return;
      }
      if (res?.version) {
        setUpdateState({ kind: 'available', version: String(res.version) });
      } else {
        await syncPending();
        setUpdateState({ kind: 'not_available' });
      }
    } catch (e: any) {
      setUpdateState({ kind: 'error', message: e?.message || 'Bilinmeyen hata' });
    }
  }, [api, syncPending]);

  const openDownloadPage = () => {
    const url = githubDirectSetupDownloadUrl();
    if (api?.openExternalUrl) void api.openExternalUrl(url);
    else window.open(url, '_blank', 'noopener');
  };

  const installNow = () => {
    void api?.installUpdate?.();
  };

  if (!api) return null;

  return (
    <div className="w-full max-w-sm mt-8 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm p-4 text-left">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-amber-300" />
        <span className="text-white/90 text-sm font-bold">Yazılım güncellemesi</span>
      </div>
      <p className="text-white/45 text-xs mb-3 leading-relaxed">
        Kurulu sürüm: <span className="text-white/70 font-mono">{appVersion || '—'}</span>
        {' · '}
        Giriş yapmadan da güncelleyebilirsiniz.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={updateState.kind === 'checking'}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-white text-xs font-bold disabled:opacity-60"
        >
          {updateState.kind === 'checking' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Güncellemeleri kontrol et
        </button>
        <button
          type="button"
          onClick={openDownloadPage}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 text-xs font-semibold"
        >
          <Download className="w-3.5 h-3.5" />
          Son sürümü indir
        </button>
        {updateState.kind === 'ready' && (
          <button
            type="button"
            onClick={installNow}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
          >
            Şimdi yükle ({updateState.version || 'yeni'})
          </button>
        )}
      </div>

      {updateState.kind === 'available' && (
        <p className="mt-2 text-xs text-amber-200/90">
          Sürüm {updateState.version} indiriliyor… Sağ alttaki bildirimi veya «Şimdi yükle»yi takip edin.
        </p>
      )}
      {updateState.kind === 'not_available' && (
        <p className="mt-2 text-xs text-emerald-300/90">Uygulamanız güncel görünüyor.</p>
      )}
      {updateState.kind === 'error' && (
        <p className="mt-2 text-xs text-red-300/90 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {updateState.message} «Son sürümü indir» ile elle kurabilirsiniz.
        </p>
      )}
    </div>
  );
}
