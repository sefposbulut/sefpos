import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { startAdaptivePoller } from './pollSchedule';

export interface ActiveShift {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  shift_no: number;
  shift_name: string;
  business_date: string;
  opened_by: string | null;
  opened_at: string;
  opening_cash: number;
  status: 'open' | 'closed';
  terminal_id?: string | null;
  terminal_name?: string | null;
  opener_full_name?: string | null;
}

export interface DailyClosureSnapshot {
  id: string;
  business_date: string;
  status: 'closed' | 'reopened';
  closed_at: string;
}

interface Options {
  branchId?: string | null;
  tenantId?: string | null;
  /** Sadece bu kullanicinin acik vardiyasini izle (paralel-mod / kisisel rozet). */
  userId?: string | null;
  enabled?: boolean;
  /** Is gunu cutoff saati (0-23). Default 6. AuthContext.businessDayStartHour'tan verin. */
  cutoffHour?: number;
}

/**
 * Aktif (open) vardiya + bugun kapatilmis gun bilgisini canli takip eder.
 * - Realtime: shifts + daily_closures
 * - 60sn polling fallback (sekme arka plana inerse uyani uyandir)
 * - userId verilirse: yalniz o kullanicinin acik vardiyasi
 */
export function useActiveShift({ branchId, tenantId, userId, enabled = true, cutoffHour }: Options) {
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [todayClosure, setTodayClosure] = useState<DailyClosureSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const inflightRef = useRef<Promise<void> | null>(null);

  const todayBusinessDate = useCallback((): string => {
    const now = new Date();
    let cutoff = typeof cutoffHour === 'number' ? Math.floor(cutoffHour) : 6;
    if (cutoff < 0) cutoff = 0; if (cutoff > 23) cutoff = 23;
    if (now.getHours() < cutoff) now.setDate(now.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, [cutoffHour]);

  const refresh = useCallback(async () => {
    if (!enabled || !tenantId) return;
    if (inflightRef.current) return inflightRef.current;
    const p = (async () => {
      try {
        const businessDate = todayBusinessDate();

        let q = (supabase as any)
          .from('shifts')
          .select('id,tenant_id,branch_id,shift_no,shift_name,business_date,opened_by,opened_at,opening_cash,status,terminal_id,terminal_name')
          .eq('tenant_id', tenantId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1);
        if (branchId) q = q.eq('branch_id', branchId);
        if (userId) q = q.eq('opened_by', userId);
        const { data: shiftRows } = await q;
        const shift = (shiftRows && shiftRows[0]) || null;

        if (shift?.opened_by) {
          const { data: prof } = await (supabase as any)
            .from('profiles')
            .select('full_name')
            .eq('id', shift.opened_by)
            .maybeSingle();
          shift.opener_full_name = prof?.full_name || null;
        }
        setActiveShift(shift);

        let dq = (supabase as any)
          .from('daily_closures')
          .select('id,business_date,status,closed_at')
          .eq('tenant_id', tenantId)
          .eq('business_date', businessDate)
          .order('closed_at', { ascending: false })
          .limit(1);
        if (branchId) dq = dq.eq('branch_id', branchId);
        const { data: closureRows } = await dq;
        const closure = (closureRows && closureRows[0]) || null;
        setTodayClosure(closure && closure.status === 'closed' ? closure : null);
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, [enabled, tenantId, branchId, todayBusinessDate]);

  useEffect(() => {
    if (!enabled || !tenantId) {
      setLoading(false);
      return;
    }
    refresh();

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
      }, 3000);
    };

    const channel = supabase
      .channel(`shift-watch-${tenantId}-${branchId || 'all'}-${userId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `tenant_id=eq.${tenantId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_closures', filter: `tenant_id=eq.${tenantId}` },
        scheduleRefresh,
      )
      .subscribe();

    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    const stopPoll = startAdaptivePoller({
      baseMs: 180_000,
      idleMs: 300_000,
      hiddenMs: 0,
      run: () => {
        if (document.visibilityState === 'visible') return refresh();
      },
      immediate: false,
    });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      document.removeEventListener('visibilitychange', onVis);
      stopPoll();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [enabled, tenantId, branchId, userId, refresh]);

  return { activeShift, todayClosure, loading, refresh };
}
