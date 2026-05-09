import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

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
  enabled?: boolean;
}

/**
 * Aktif (open) vardiya + bugun kapatilmis gun bilgisini canli takip eder.
 * - Realtime: shifts + daily_closures
 * - 60sn polling fallback (sekme arka plana inerse uyani uyandir)
 */
export function useActiveShift({ branchId, tenantId, enabled = true }: Options) {
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [todayClosure, setTodayClosure] = useState<DailyClosureSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const inflightRef = useRef<Promise<void> | null>(null);

  const todayBusinessDate = useCallback((): string => {
    const now = new Date();
    if (now.getHours() < 6) now.setDate(now.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

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

    const channel = supabase
      .channel(`shift-watch-${tenantId}-${branchId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `tenant_id=eq.${tenantId}` },
        () => {
          refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_closures', filter: `tenant_id=eq.${tenantId}` },
        () => {
          refresh();
        },
      )
      .subscribe();

    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, [enabled, tenantId, branchId, refresh]);

  return { activeShift, todayClosure, loading, refresh };
}
