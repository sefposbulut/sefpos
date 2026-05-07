import { useEffect, useRef, useState } from 'react';
import { Bell, X, Check, Receipt, Droplets, HelpCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface WaiterCall {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_label: string;
  call_type: 'service' | 'bill' | 'water' | 'help';
  message: string | null;
  status: 'pending' | 'seen' | 'resolved' | 'cancelled';
  created_at: string;
}

const ICONS: Record<WaiterCall['call_type'], any> = {
  service: Bell,
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

/**
 * POS için garson çağrı bildirim sistemi.
 * - Tenant scope'da realtime subscribe.
 * - Yeni 'pending' çağrı geldiğinde toast + sesli uyarı.
 * - Tek tıkla 'resolved' yapılır.
 */
export function WaiterCallToaster() {
  const { tenant, activeBranch } = useAuth();
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sefpos_waiter_call_muted') === '1';
    } catch {
      return false;
    }
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const tenantIdRef = useRef<string | null>(null);

  useEffect(() => {
    tenantIdRef.current = tenant?.id || null;
  }, [tenant?.id]);

  // İlk yükleme: mevcut bekleyen çağrılar
  useEffect(() => {
    if (!tenant?.id) {
      setCalls([]);
      seenIdsRef.current.clear();
      return;
    }
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from('waiter_calls')
        .select('*')
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'seen'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancel) {
        if (error) {
          console.error('[ŞefPOS] waiter_calls liste:', error);
          setCalls([]);
        } else {
          const list = (data || []) as WaiterCall[];
          for (const c of list) seenIdsRef.current.add(c.id);
          setCalls(list);
        }
      }
    })();
    return () => { cancel = true; };
  }, [tenant?.id]);

  // Realtime subscribe
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel(`waiter-calls-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'waiter_calls',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const c = payload.new as WaiterCall;
          if (!c?.id || seenIdsRef.current.has(c.id)) return;
          seenIdsRef.current.add(c.id);
          setCalls(prev => [c, ...prev].slice(0, 20));
          setCollapsed(false);
          if (!muted) playBeep();
          showSystemNotification(c);
          vibrate();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'waiter_calls',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const c = payload.new as WaiterCall;
          setCalls(prev => {
            if (c.status === 'resolved' || c.status === 'cancelled') {
              return prev.filter(x => x.id !== c.id);
            }
            return prev.map(x => x.id === c.id ? c : x);
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, muted]);

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current!;
      // 2 hızlı ding
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

  // İlk açılışta bildirim izni iste
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch { /* ignore */ }
    }
  }, []);

  const resolveCall = async (id: string) => {
    setCalls(prev => prev.filter(x => x.id !== id));
    const { error } = await supabase
      .from('waiter_calls')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[ŞefPOS] çağrıyı kapatma:', error);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem('sefpos_waiter_call_muted', next ? '1' : '0'); } catch { /* ignore */ }
  };

  if (!tenant?.id || calls.length === 0) return null;

  // Filter: aktif şube varsa onun çağrıları öne, diğer şubeler de görünür ama sönük
  const branchId = activeBranch?.id;
  const sorted = [...calls].sort((a, b) => {
    const aMine = !branchId || a.branch_id === branchId;
    const bMine = !branchId || b.branch_id === branchId;
    if (aMine !== bMine) return aMine ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="fixed top-16 md:top-24 right-3 md:right-6 z-[60] w-[300px] sm:w-[340px] pointer-events-none">
      <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex w-2.5 h-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <Bell className="w-4 h-4" />
            <span className="font-extrabold text-sm">Garson Çağrısı</span>
            <span className="bg-white/25 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
              {sorted.length}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleMute}
              title={muted ? 'Sesi Aç' : 'Sessize Al'}
              className="p-1 rounded hover:bg-white/20"
            >
              {muted ? '🔕' : '🔔'}
            </button>
            <button
              onClick={() => setCollapsed(v => !v)}
              className="p-1 rounded hover:bg-white/20"
              title={collapsed ? 'Aç' : 'Küçült'}
            >
              {collapsed ? '▾' : '▴'}
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {sorted.map(c => {
              const Icon = ICONS[c.call_type] || Bell;
              const colorClass = COLORS[c.call_type];
              const ts = new Date(c.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              const isOtherBranch = branchId && c.branch_id !== branchId;
              return (
                <div key={c.id} className={`px-3 py-2.5 flex items-start gap-2.5 ${isOtherBranch ? 'bg-slate-50 opacity-70' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorClass} text-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm truncate">{c.table_label || '-'}</span>
                      <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                        {LABELS[c.call_type]}
                      </span>
                      {isOtherBranch && (
                        <span className="text-[9px] uppercase font-bold text-slate-400 bg-slate-200 px-1 rounded">
                          Diğer Şube
                        </span>
                      )}
                    </div>
                    {c.message && (
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{c.message}</p>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                      <Clock className="w-3 h-3" />
                      {ts}
                    </div>
                  </div>
                  <button
                    onClick={() => resolveCall(c.id)}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200"
                    title="Tamamla"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
