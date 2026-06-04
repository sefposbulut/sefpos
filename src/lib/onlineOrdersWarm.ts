import { supabase } from './supabase';

/** OnlineOrders liste satırı — bileşenle aynı sorgu */
export type OnlineOrderWarmRow = Record<string, unknown> & {
  id: string;
  tenant_id: string;
  items?: unknown[];
  online_order_platforms?: Record<string, unknown>;
};

const onlineOrdersCache = new Map<string, OnlineOrderWarmRow[]>();

export function readOnlineOrdersCache(tenantId: string): OnlineOrderWarmRow[] | null {
  const rows = onlineOrdersCache.get(tenantId);
  return rows?.length ? rows : null;
}

export function writeOnlineOrdersCache(tenantId: string, rows: OnlineOrderWarmRow[]): void {
  onlineOrdersCache.set(tenantId, rows);
}

export async function fetchOnlineOrdersList(
  tenantId: string,
): Promise<OnlineOrderWarmRow[]> {
  const { data, error } = await supabase
    .from('online_orders')
    .select(`*, online_order_platforms(*), items:online_order_items(*)`)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data || []) as OnlineOrderWarmRow[];
  writeOnlineOrdersCache(tenantId, rows);
  return rows;
}

/** Profil hazır olunca arka planda doldur */
export function prefetchOnlineOrders(tenantId: string): void {
  if (!tenantId || onlineOrdersCache.has(tenantId)) return;
  void fetchOnlineOrdersList(tenantId).catch(() => {});
}
