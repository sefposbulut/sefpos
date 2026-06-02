import { supabase } from './supabase';

export type CurrentBusinessDateRow = {
  business_date: string;
  mode?: string;
  cutoff_hour?: number;
  last_closed?: string | null;
  hours_open?: number | null;
};

const SKIP_RPC_KEY = 'sefpos_skip_business_date_rpc';

/** İstemci tarafı cutoff iş günü (YYYY-MM-DD). */
export function computeClientBusinessDate(startHour = 6, at = new Date()): string {
  const h = Math.min(23, Math.max(0, Number(startHour) || 6));
  const x = new Date(at);
  if (x.getHours() < h) x.setDate(x.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function addCalendarDay(isoDate: string, days = 1): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveMode(branchMode: unknown, tenantMode: unknown): 'cutoff' | 'manual' {
  if (branchMode === 'manual' || branchMode === 'cutoff') return branchMode;
  if (tenantMode === 'manual' || tenantMode === 'cutoff') return tenantMode;
  return 'cutoff';
}

/**
 * İş günü bilgisi — PostgREST RPC yerine doğrudan tablolar (400 spam yok).
 * Manuel modda daily_closures + shifts ile sunucu RPC ile aynı mantık.
 */
export async function fetchCurrentBusinessDate(
  branchId: string,
): Promise<CurrentBusinessDateRow | null> {
  if (!branchId) return null;

  try {
    const { data: branch, error: branchErr } = await supabase
      .from('branches')
      .select('id, business_day_mode, business_day_start_hour, tenant_id, tenants ( business_day_mode, business_day_start_hour )')
      .eq('id', branchId)
      .maybeSingle();

    if (branchErr || !branch) return null;

    const tenant = (branch as { tenants?: { business_day_mode?: string; business_day_start_hour?: number } | null })
      .tenants;
    const mode = resolveMode(branch.business_day_mode, tenant?.business_day_mode);
    const cutoffHour = Number(
      branch.business_day_start_hour ?? tenant?.business_day_start_hour ?? 6,
    );

    let lastClosed: string | null = null;
    const { data: lastRow } = await supabase
      .from('daily_closures')
      .select('business_date')
      .eq('branch_id', branchId)
      .eq('status', 'closed')
      .order('business_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRow?.business_date) lastClosed = String(lastRow.business_date);

    let businessDate: string;
    if (mode === 'manual') {
      businessDate = lastClosed ? addCalendarDay(lastClosed, 1) : new Date().toISOString().slice(0, 10);
    } else {
      businessDate = computeClientBusinessDate(cutoffHour);
    }

    let hoursOpen: number | null = null;
    if (mode === 'manual') {
      let shiftQuery = supabase
        .from('shifts')
        .select('opened_at, business_date')
        .eq('branch_id', branchId)
        .order('opened_at', { ascending: true })
        .limit(1);
      if (lastClosed) {
        shiftQuery = shiftQuery.gt('business_date', lastClosed);
      }
      const { data: shiftRow } = await shiftQuery.maybeSingle();
      if (shiftRow?.opened_at) {
        const opened = new Date(String(shiftRow.opened_at)).getTime();
        if (Number.isFinite(opened)) {
          hoursOpen = Math.round(((Date.now() - opened) / 3_600_000) * 10) / 10;
        }
      }
    }

    return {
      business_date: businessDate,
      mode,
      cutoff_hour: cutoffHour,
      last_closed: lastClosed,
      hours_open: hoursOpen,
    };
  } catch {
    return null;
  }
}

/** Eski RPC yolu kapalı (session flag temizliği). */
export function resetBusinessDateRpcProbe(): void {
  try {
    sessionStorage.removeItem(SKIP_RPC_KEY);
  } catch {
    /* ignore */
  }
}
