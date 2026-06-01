import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing, Bell, BellOff, X, Check, Receipt, Droplets, HelpCircle, Clock,
  CheckCircle2, History, Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isActivePosPage } from '../lib/pageActivity';

interface WaiterCall {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_label: string;
  call_type: 'service' | 'bill' | 'water' | 'help';
  message: string | null;
  status: 'pending' | 'seen' | 'resolved' | 'cancelled';
  created_at: string;
  resolved_at?: string | null;
}

const ICONS: Record<WaiterCall['call_type'], any> = {
  service: BellRing,
  bill: Receipt,
  water: Droplets,
  help: HelpCircle,
};
const LABELS: Record<WaiterCall['call_type'], string> = {
  service: 'Garson',
  bill: 'Hesap',
  water: 'Su',
  help: 'Yardım',
};
const COLORS: Record<WaiterCall['call_type'], string> = {
  service: 'from-orange-500 to-orange-600',
  bill: 'from-emerald-500 to-emerald-600',
  water: 'from-sky-500 to-sky-600',
  help: 'from-violet-500 to-violet-600',
};

const HISTORY_LIMIT = 60;

/**
 * Header'a entegre edilen "Garson çağrısı zili" — POS panelinde sürekli görünür.
 * - BellRing (concierge zili) ikonu, bekleyen çağrı varsa pulsasyonlu turuncu badge.
 * - Tıklayınca dropdown: Aktif + Geçmiş sekmeli çağrı listesi.
 * - Yeni çağrı geldiğinde: ses + titreşim + 3.5sn toast popup (sağ üstte).
 * - Realtime + SUBSCRIBED sonrası HTTP ile tam senkron; 12 sn yedek poll; sekme/odak/online yenileme.
 */
type WaiterCallBellProps = {
  /** Turuncu Electron ust barinda ikonlar beyaz gorunsun */
  headerVariant?: 'default' | 'electron-bar';
};

export function WaiterCallBell({ headerVariant = 'default' }: WaiterCallBellProps) {
  const { tenant, activeBranch } = useAuth();

  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem('sefpos_waiter_call_muted') === '1'; } catch { return false; }
  });
  const [toast, setToast] = useState<WaiterCall | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const callsRef = useRef<WaiterCall[]>([]);
  const mutedRef = useRef(muted);
  /** İlk HTTP liste tamamlanmadan SUBSCRIBED/poll ile toast yağmurunu engelle */
  const initialPullDoneRef = useRef(false);
  const tenantIdRef = useRef<string | undefined>(undefined);
  tenantIdRef.current = tenant?.id;

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

  const notifyNewCall = (c: WaiterCall) => {
    if (!c?.id || mutedRef.current) return;
    playBeep();
    showSystemNotification(c);
    vibrate();
    setToast(c);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };

  /** Sunucudan çek; Realtime kaçırsa veya socket geç bağlansa yine de liste güncellenir. */
  const pullLatest = useCallback(async (opts?: { notifyNew?: boolean }) => {
    const tid = tenantIdRef.current;
    if (!tid) return;
    const { data, error } = await supabase
      .from('waiter_calls')
      .select('*')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) {
      console.error('[ŞefPOS] waiter_calls liste:', error);
      return;
    }
    const list = (data || []) as WaiterCall[];
    const prev = callsRef.current;
    const prevActiveIds = new Set(
      prev.filter(x => x.status === 'pending' || x.status === 'seen').map(x => x.id),
    );
    setCalls(list);

    const notifyNew = opts?.notifyNew === true && initialPullDoneRef.current;
    if (notifyNew) {
      const freshActive = list.filter(
        c => (c.status === 'pending' || c.status === 'seen') && !prevActiveIds.has(c.id),
      );
      if (freshActive.length > 0) {
        freshActive.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        notifyNewCall(freshActive[0]);
      }
    }
  }, []);

  // İlk yükleme: aktif + geçmiş (toast yok)
  useEffect(() => {
    if (!tenant?.id) {
      setCalls([]);
      initialPullDoneRef.current = false;
      return;
    }
    let cancel = false;
    initialPullDoneRef.current = false;
    (async () => {
      await pullLatest({ notifyNew: false });
      if (!cancel) initialPullDoneRef.current = true;
    })();
    return () => {
      cancel = true;
    };
  }, [tenant?.id, pullLatest]);

  // Realtime + SUBSCRIBED sonrası tam senkron + periyodik yedek + sekme uyanınca yenile
  useEffect(() => {
    if (!tenant?.id) return;

    const POLL_MS = 45_000;
    const pollTimer = window.setInterval(() => {
      if (!isActivePosPage('tables', 'waiter-app')) return;
      void pullLatest({ notifyNew: true });
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullLatest({ notifyNew: true });
    };
    const onOnline = () => void pullLatest({ notifyNew: true });
    const onFocus = () => void pullLatest({ notifyNew: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    const channel = supabase
      .channel(`waiter-calls-${tenant.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'waiter_calls', filter: `tenant_id=eq.${tenant.id}` },
        (payload) => {
          const c = payload.new as WaiterCall;
          if (!c?.id) return;
          const hadRow = callsRef.current.some(x => x.id === c.id);
          setCalls(prev => {
            if (prev.some(x => x.id === c.id)) {
              return prev.map(x => (x.id === c.id ? c : x));
            }
            return [c, ...prev].slice(0, HISTORY_LIMIT);
          });
          if (!hadRow && !mutedRef.current) {
            playBeep();
            showSystemNotification(c);
            vibrate();
            setToast(c);
            if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waiter_calls', filter: `tenant_id=eq.${tenant.id}` },
        (payload) => {
          const c = payload.new as WaiterCall;
          setCalls(prev => prev.map(x => x.id === c.id ? c : x));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'waiter_calls', filter: `tenant_id=eq.${tenant.id}` },
        (payload) => {
          const c = payload.old as WaiterCall;
          setCalls(prev => prev.filter(x => x.id !== c.id));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // WebSocket geç bağlandıysa INSERT kaçmış olabilir — DB ile eşle (toast yalnız ilk liste sonrası)
          void pullLatest({ notifyNew: initialPullDoneRef.current });
        }
      });

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [tenant?.id, pullLatest]);

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current!;
      const beep = (offset: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t0 = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30);
        osc.start(t0);
        osc.stop(t0 + 0.32);
      };
      beep(0, 880);
      beep(0.18, 1175);
    } catch { /* ignore */ }
  };

  const vibrate = () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        (navigator as any).vibrate?.([120, 60, 120]);
      }
    } catch { /* ignore */ }
  };

  const showSystemNotification = (c: WaiterCall) => {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        new Notification(`Garson Çağrısı · ${c.table_label || '-'}`, {
          body: `${LABELS[c.call_type]}${c.message ? ' · ' + c.message : ''}`,
          tag: c.id,
        });
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch { /* ignore */ }
    }
  }, []);

  const resolveCall = async (id: string) => {
    setCalls(prev => prev.map(x => x.id === id ? { ...x, status: 'resolved', resolved_at: new Date().toISOString() } : x));
    const { error } = await supabase
      .from('waiter_calls')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('[ŞefPOS] çağrıyı kapatma:', error);
  };

  const resolveAll = async () => {
    if (!tenant?.id) return;
    if (!confirm('Tüm bekleyen çağrılar tamamlandı olarak işaretlensin mi?')) return;
    const now = new Date().toISOString();
    setCalls(prev => prev.map(x => x.status === 'pending' || x.status === 'seen'
      ? { ...x, status: 'resolved', resolved_at: now } : x));
    await supabase
      .from('waiter_calls')
      .update({ status: 'resolved', resolved_at: now })
      .eq('tenant_id', tenant.id)
      .in('status', ['pending', 'seen']);
  };

  const deleteHistory = async (id: string) => {
    setCalls(prev => prev.filter(x => x.id !== id));
    await supabase.from('waiter_calls').delete().eq('id', id);
  };

  const clearHistory = async () => {
    if (!tenant?.id) return;
    if (!confirm('Tüm geçmiş çağrılar silinsin mi? (Bekleyenler etkilenmez)')) return;
    setCalls(prev => prev.filter(x => x.status === 'pending' || x.status === 'seen'));
    await supabase
      .from('waiter_calls')
      .delete()
      .eq('tenant_id', tenant.id)
      .in('status', ['resolved', 'cancelled']);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem('sefpos_waiter_call_muted', next ? '1' : '0'); } catch { /* ignore */ }
  };

  const branchId = activeBranch?.id;
  const { active, history } = useMemo(() => {
    const sorted = [...calls].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return {
      active: sorted.filter(c => c.status === 'pending' || c.status === 'seen'),
      history: sorted.filter(c => c.status === 'resolved' || c.status === 'cancelled'),
    };
  }, [calls]);

  if (!tenant?.id) return null;

  const pendingCount = active.length;

  return (
    <>
      {/* Header butonu */}
      <button
        onClick={() => { setOpen(o => !o); setToast(null); }}
        className={`relative rounded-lg transition-all active:scale-95 ${
          pendingCount > 0
            ? headerVariant === 'electron-bar'
              ? 'h-10 w-10 inline-flex items-center justify-center text-white bg-white/25 hover:bg-white/35 ring-2 ring-white/45 shadow-md animate-pulse'
              : 'p-1.5 md:p-2 text-white bg-gradient-to-br from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md animate-pulse'
            : headerVariant === 'electron-bar'
              ? 'h-10 w-10 inline-flex items-center justify-center text-white hover:text-white hover:bg-white/12'
              : 'p-1.5 md:p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        title={pendingCount > 0 ? `${pendingCount} bekleyen garson çağrısı` : 'Garson çağrıları'}
        aria-label="Garson çağrıları"
      >
        <BellRing className="w-4 h-4 md:w-5 md:h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 border-2 border-white text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed top-14 md:top-20 right-3 md:right-6 z-[61] w-[320px] sm:w-[380px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <BellRing className="w-4 h-4" />
                <span className="font-extrabold text-sm">Garson Çağrıları</span>
                {pendingCount > 0 && (
                  <span className="bg-white/25 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    {pendingCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleMute}
                  title={muted ? 'Sesi Aç' : 'Sessize Al'}
                  className="p-1.5 rounded hover:bg-white/20"
                >
                  {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded hover:bg-white/20"
                  title="Kapat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex border-b border-slate-200 bg-slate-50">
              <button
                onClick={() => setTab('active')}
                className={`flex-1 px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tab === 'active'
                    ? 'text-orange-700 border-b-2 border-orange-500 bg-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <BellRing className="w-3.5 h-3.5" />
                Aktif
                {pendingCount > 0 && (
                  <span className="bg-orange-100 text-orange-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('history')}
                className={`flex-1 px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tab === 'history'
                    ? 'text-slate-700 border-b-2 border-slate-500 bg-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Geçmiş
                {history.length > 0 && (
                  <span className="bg-slate-200 text-slate-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {tab === 'active' ? (
                active.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-emerald-500" />}
                    title="Bekleyen çağrı yok"
                    text="Tüm masalar şu an sakin."
                  />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {active.map(c => (
                      <CallRow
                        key={c.id}
                        call={c}
                        muted={!!branchId && c.branch_id !== branchId}
                        onAction={() => resolveCall(c.id)}
                        actionLabel="Tamamla"
                        actionType="resolve"
                      />
                    ))}
                  </div>
                )
              ) : history.length === 0 ? (
                <EmptyState
                  icon={<History className="w-8 h-8 text-slate-400" />}
                  title="Henüz geçmiş yok"
                  text="Tamamlanan çağrılar burada listelenir."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {history.map(c => (
                    <CallRow
                      key={c.id}
                      call={c}
                      muted={!!branchId && c.branch_id !== branchId}
                      onAction={() => deleteHistory(c.id)}
                      actionLabel="Sil"
                      actionType="delete"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 px-2 py-1.5 flex items-center gap-1 bg-slate-50">
              {tab === 'active' && pendingCount > 0 && (
                <button
                  onClick={resolveAll}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200"
                >
                  <Check className="w-3.5 h-3.5" /> Tümünü Tamamla
                </button>
              )}
              {tab === 'history' && history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Geçmişi Temizle
                </button>
              )}
              {((tab === 'active' && pendingCount === 0) || (tab === 'history' && history.length === 0)) && (
                <span className="flex-1 text-center text-[11px] text-slate-400 py-1.5">
                  Toplam: {calls.length}/{HISTORY_LIMIT}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Yeni geldiğinde toast */}
      {toast && !open && (
        <div
          onClick={() => { setOpen(true); setTab('active'); setToast(null); }}
          className="fixed top-16 md:top-24 right-3 md:right-6 z-[59] w-[280px] sm:w-[320px] bg-white rounded-2xl shadow-2xl border border-orange-200 overflow-hidden cursor-pointer"
          style={{ animation: 'sefposCallSlideIn 0.3s ease-out' }}
        >
          <div className={`flex items-center gap-2.5 px-3 py-2 bg-gradient-to-r ${COLORS[toast.call_type]} text-white`}>
            <span className="relative flex w-2.5 h-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <BellRing className="w-4 h-4" />
            <span className="font-extrabold text-sm">Yeni Çağrı</span>
            <span className="ml-auto text-[10px] uppercase font-bold bg-white/25 px-1.5 py-0.5 rounded-full">
              {LABELS[toast.call_type]}
            </span>
          </div>
          <div className="p-3">
            <div className="font-bold text-slate-800 text-sm">
              Masa: {toast.table_label || '-'}
            </div>
            {toast.message && (
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{toast.message}</p>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">Açmak için tıklayın</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sefposCallSlideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

function CallRow({
  call, muted, onAction, actionLabel, actionType,
}: {
  call: WaiterCall;
  muted: boolean;
  onAction: () => void;
  actionLabel: string;
  actionType: 'resolve' | 'delete';
}) {
  const Icon = ICONS[call.call_type] || BellRing;
  const colorClass = COLORS[call.call_type];
  const created = new Date(call.created_at);
  const ts = created.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const dt = created.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  const isResolved = call.status === 'resolved' || call.status === 'cancelled';

  return (
    <div className={`px-3 py-2.5 flex items-start gap-2.5 ${muted ? 'bg-slate-50 opacity-70' : ''} ${isResolved ? 'opacity-75' : ''}`}>
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorClass} text-white flex items-center justify-center flex-shrink-0 shadow-sm ${isResolved ? 'grayscale' : ''}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold text-sm truncate ${isResolved ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
            {call.table_label || '-'}
          </span>
          <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
            {LABELS[call.call_type]}
          </span>
          {muted && (
            <span className="text-[9px] uppercase font-bold text-slate-400 bg-slate-200 px-1 rounded">
              Diğer Şube
            </span>
          )}
          {isResolved && (
            <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-100 px-1.5 rounded inline-flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Tamamlandı
            </span>
          )}
        </div>
        {call.message && (
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{call.message}</p>
        )}
        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {ts}
          </span>
          <span>·</span>
          <span>{dt}</span>
          {call.resolved_at && (
            <>
              <span>·</span>
              <span className="text-emerald-600">
                Bitti: {new Date(call.resolved_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>
      </div>
      <button
        onClick={onAction}
        className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold border transition ${
          actionType === 'resolve'
            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
            : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
        }`}
        title={actionLabel}
      >
        {actionType === 'resolve' ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function EmptyState({
  icon, title, text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="mb-2">{icon}</div>
      <p className="font-bold text-slate-700 text-sm">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{text}</p>
    </div>
  );
}
