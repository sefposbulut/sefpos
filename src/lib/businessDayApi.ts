import { supabase } from './supabase';

export type CurrentBusinessDateRow = {
  business_date: string;
  mode?: string;
  cutoff_hour?: number;
  last_closed?: string | null;
  hours_open?: number | null;
};

/** İstemci tarafı cutoff iş günü (YYYY-MM-DD). */
export function computeClientBusinessDate(startHour = 6, at = new Date()): string {
  const h = Math.min(23, Math.max(0, Number(startHour) || 6));
  const x = new Date(at);
  if (x.getHours() < h) x.setDate(x.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

let rpcPermanentFailure = false;
let rpcWarnedOnce = false;

function normalizeRpcRow(data: unknown): CurrentBusinessDateRow | null {
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const bd = (row as { business_date?: unknown }).business_date;
  if (!bd) return null;
  return row as CurrentBusinessDateRow;
}

/**
 * Manuel iş günü modunda sunucudan tarih sorar.
 * RPC yok / 400 → sessizce null (çağıran cutoff fallback kullanır).
 */
export async function fetchCurrentBusinessDate(
  branchId: string,
): Promise<CurrentBusinessDateRow | null> {
  if (!branchId || rpcPermanentFailure) return null;
  try {
    const { data, error } = await (supabase as any).rpc('get_current_business_date', {
      p_branch_id: branchId,
    });
    if (error) {
      const code = String((error as { code?: string }).code || '');
      const msg = String(error.message || '').toLowerCase();
      const missing =
        code === 'PGRST202' ||
        code === '42883' ||
        msg.includes('does not exist') ||
        msg.includes('could not find the function');
      if (missing) rpcPermanentFailure = true;
      if (!rpcWarnedOnce) {
        rpcWarnedOnce = true;
        console.warn(
          '[ŞefPOS] get_current_business_date kullanılamıyor; yerel iş günü hesabı kullanılacak.',
          error.message,
        );
      }
      return null;
    }
    return normalizeRpcRow(data);
  } catch {
    return null;
  }
}

export function resetBusinessDateRpcProbe(): void {
  rpcPermanentFailure = false;
  rpcWarnedOnce = false;
}
