import { useCallback, useEffect, useState } from 'react';
import { Printer, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PRINT_TOAST_EVENT, type PrintToastDetail } from '../lib/printToasts';
import { ELECTRON_HEADER_CHIP_CLASS } from '../lib/electronLayout';

type ChipState = 'idle' | 'busy' | 'ok' | 'error';

type RecentLine = {
  id: string;
  at: number;
  kind: PrintToastDetail['kind'];
  message: string;
  detail?: string;
  target?: string;
};

const isElectron = !!(window as any).electronAPI;

/**
 * Üst çubuk: ŞefPOS Print — arka planda kuyruk / son yazdırma durumu.
 * Tıklanınca son olaylar + bekleyen iş sayısı.
 */
export function PrintStatusChip() {
  const { tenant, activeBranch } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ChipState>('idle');
  const [label, setLabel] = useState('Yazıcı');
  const [pending, setPending] = useState(0);
  const [recent, setRecent] = useState<RecentLine[]>([]);

  const pushRecent = useCallback((d: PrintToastDetail) => {
    setRecent((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          at: Date.now(),
          kind: d.kind,
          message: d.message,
          detail: d.detail,
          target: d.target,
        },
        ...prev,
      ].slice(0, 12),
    );
    if (d.kind === 'error') {
      setState('error');
      setLabel('Yazıcı hata');
    } else if (d.kind === 'queued') {
      setState('busy');
      setLabel('Kuyrukta');
    } else {
      setState('ok');
      setLabel(d.message.includes('Mutfak') ? 'Mutfak OK' : 'Yazıcı OK');
      window.setTimeout(() => {
        setState((s) => (s === 'ok' ? 'idle' : s));
        setLabel('Yazıcı');
      }, 4000);
    }
  }, []);

  useEffect(() => {
    const onToast = (evt: Event) => {
      const e = evt as CustomEvent<PrintToastDetail>;
      if (e.detail) pushRecent(e.detail);
    };
    window.addEventListener(PRINT_TOAST_EVENT, onToast);
    return () => window.removeEventListener(PRINT_TOAST_EVENT, onToast);
  }, [pushRecent]);

  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        let q = supabase
          .from('print_jobs')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'processing']);
        q = q.eq('tenant_id', tenant.id);
        if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
        const { count } = await q;
        if (cancelled) return;
        const n = count ?? 0;
        setPending(n);
        if (n > 0) {
          setState((s) => (s === 'error' ? s : 'busy'));
          setLabel(n === 1 ? '1 fiş basılıyor' : `${n} fiş kuyrukta`);
        } else {
          setState((s) => (s === 'busy' ? 'idle' : s));
          setLabel((prev) => (prev.includes('kuyruk') || prev.includes('basılıyor') ? 'Yazıcı' : prev));
        }
      } catch {
        /* sessiz */
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tenant?.id, activeBranch?.id]);

  const tone =
    state === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : state === 'busy'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : state === 'ok'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : isElectron
            ? ELECTRON_HEADER_CHIP_CLASS
            : 'bg-white text-slate-600 border-slate-200';

  const Icon =
    state === 'busy' ? Loader2 : state === 'error' ? AlertTriangle : state === 'ok' ? CheckCircle2 : Printer;

  const showLabel = state !== 'idle' || pending > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="ŞefPOS Print — yazıcı / mutfak kuyruğu"
        className={`inline-flex items-center justify-center gap-1 h-9 min-w-9 px-2 rounded-lg border text-xs font-semibold transition active:scale-95 ${tone}`}
      >
        <Icon className={`w-[18px] h-[18px] shrink-0 ${state === 'busy' ? 'animate-spin' : ''}`} />
        {showLabel && (
          <span className="hidden md:inline max-w-[7rem] truncate">{label}</span>
        )}
        {pending > 0 && (
          <span className="min-w-[1.1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">
            {pending}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[80] cursor-default"
            aria-label="Kapat"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1.5 z-[90] w-72 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-black tracking-wide">ŞefPOS Print</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-slate-100 text-[11px] text-slate-600">
              {pending > 0 ? (
                <span className="font-bold text-amber-700">{pending} iş kuyrukta / basılıyor</span>
              ) : (
                <span>
                  Durum: <strong className="text-slate-800">{label}</strong> — mutfak fişleri arka planda basılır
                </span>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {recent.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">Henüz yazdırma yok</p>
              ) : (
                recent.map((r) => (
                  <div key={r.id} className="px-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-start gap-2">
                      {r.kind === 'error' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                      ) : r.kind === 'queued' ? (
                        <Loader2 className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{r.message}</p>
                        {(r.target || r.detail) && (
                          <p className="text-[10px] text-slate-500 truncate">
                            {[r.target, r.detail].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
