import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';
import { writeElectronHomeCache } from './electronHomeCache';

export type DashboardSnapshot = {
  /** Aktif şubede `current_order_id` dolu masa sayısı */
  openTablesWithOrder: number;
  occupiedTables: number;
  totalTables: number;
  todayRevenue: number;
  yesterdayRevenue: number;
  todayOrderCount: number;
  todayTakeawayCount: number;
  todayOnlineCount: number;
  pendingOnlineCount: number;
};

export type RecentActivityRow = {
  id: string;
  kind: 'table' | 'takeaway' | 'online';
  title: string;
  subtitle: string;
  amount: number;
  status: string;
  statusTone: 'open' | 'preparing' | 'done' | 'neutral';
  created_at: string;
};

export type TopSellerRow = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

function dayBounds(offsetDays = 0): { start: string; end: string; label: string } {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const iso = `${y}-${m}-${day}`;
  return {
    start: `${iso}T00:00:00`,
    end: `${iso}T23:59:59.999`,
    label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export async function fetchElectronDashboardSnapshot(
  tenantId: string,
  branchId: string | null,
): Promise<DashboardSnapshot> {
  const empty: DashboardSnapshot = {
    openTablesWithOrder: 0,
    occupiedTables: 0,
    totalTables: 0,
    todayRevenue: 0,
    yesterdayRevenue: 0,
    todayOrderCount: 0,
    todayTakeawayCount: 0,
    todayOnlineCount: 0,
    pendingOnlineCount: 0,
  };
  if (isSqlServerMode() || !branchId) return empty;

  const today = dayBounds(0);
  const yesterday = dayBounds(-1);

  let tablesQ = supabase
    .from('restaurant_tables')
    .select('id, status, current_order_id', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId);

  let ordersTodayQ = supabase
    .from('orders')
    .select('id, status, total_amount, order_type')
    .eq('tenant_id', tenantId)
    .gte('created_at', today.start)
    .lte('created_at', today.end);
  ordersTodayQ = ordersTodayQ.eq('branch_id', branchId);

  let ordersYesterdayQ = supabase
    .from('orders')
    .select('total_amount, status')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'completed')
    .gte('created_at', yesterday.start)
    .lte('created_at', yesterday.end);

  let onlinePendingQ = supabase
    .from('online_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .in('status', ['new', 'scheduled_new', 'verified', 'accepted', 'preparing']);

  const [tablesRes, ordersTodayRes, ordersYesterdayRes, onlinePendingRes] = await Promise.all([
    tablesQ,
    ordersTodayQ,
    ordersYesterdayQ,
    onlinePendingQ,
  ]);

  const tables = (tablesRes.data || []) as { id: string; status?: string; current_order_id?: string | null }[];
  const occupied = tables.filter(
    (t) => t.status === 'occupied' || (t.current_order_id != null && t.current_order_id !== ''),
  ).length;
  const withOrder = tables.filter(
    (t) => t.current_order_id != null && String(t.current_order_id).length > 0,
  ).length;

  const todayOrders = ((ordersTodayRes.data || []) as { status: string; total_amount: number; order_type: string }[]);
  const completedToday = todayOrders.filter((o) => o.status === 'completed');
  const todayRevenue = completedToday.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const yesterdayRows = (ordersYesterdayRes.data || []) as { total_amount: number }[];
  const yesterdayRevenue = yesterdayRows.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return {
    openTablesWithOrder: withOrder,
    occupiedTables: occupied,
    totalTables: tablesRes.count ?? tables.length,
    todayRevenue,
    yesterdayRevenue,
    todayOrderCount: completedToday.length,
    todayTakeawayCount: completedToday.filter((o) => o.order_type === 'takeaway').length,
    todayOnlineCount: completedToday.filter((o) => o.order_type === 'delivery').length,
    pendingOnlineCount: onlinePendingRes.count ?? 0,
  };
}

const mapOrderStatus = (status: string): { label: string; tone: RecentActivityRow['statusTone'] } => {
  if (status === 'completed') return { label: 'Tamamlandı', tone: 'done' };
  if (status === 'cancelled') return { label: 'İptal', tone: 'neutral' };
  if (status === 'active' || status === 'open') return { label: 'Açık', tone: 'open' };
  if (status === 'pending') return { label: 'Hazırlanıyor', tone: 'preparing' };
  return { label: status, tone: 'neutral' };
};

export async function fetchElectronRecentActivity(
  tenantId: string,
  branchId: string | null,
  limit = 8,
): Promise<RecentActivityRow[]> {
  if (isSqlServerMode() || !branchId) return [];

  const perSource = Math.max(limit, 8);

  const [ordersRes, onlineRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, status, total_amount, order_type, created_at, table_id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(perSource),
    supabase
      .from('online_orders')
      .select('id, customer_name, status, total_amount, created_at, platform_order_number')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(perSource),
  ]);

  const orders = (ordersRes.data || []) as Record<string, unknown>[];
  const tableIds = [
    ...new Set(
      orders.map((o) => o.table_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const tableMap = new Map<string, string | number>();
  if (tableIds.length > 0) {
    const { data: tables } = await supabase
      .from('restaurant_tables')
      .select('id, table_number')
      .eq('tenant_id', tenantId)
      .in('id', tableIds);
    for (const t of tables || []) {
      tableMap.set(String((t as { id: string }).id), (t as { table_number?: string | number }).table_number ?? '');
    }
  }

  const orderRows: RecentActivityRow[] = orders.map((o) => {
    const tableNum = o.table_id ? tableMap.get(String(o.table_id)) : null;
    const st = mapOrderStatus(String(o.status || ''));
    const orderType = String(o.order_type || '');
    return {
      id: `o-${o.id}`,
      kind: orderType === 'takeaway' ? 'takeaway' : 'table',
      title: tableNum != null && tableNum !== '' ? `Masa ${tableNum}` : `Sipariş #${o.order_number || '—'}`,
      subtitle: orderType === 'takeaway' ? 'Paket servis' : 'Salon',
      amount: Number(o.total_amount) || 0,
      status: st.label,
      statusTone: st.tone,
      created_at: String(o.created_at || ''),
    };
  });

  const onlineRows: RecentActivityRow[] = (onlineRes.data || []).map((o: Record<string, unknown>) => {
    const raw = String(o.status || '');
    let st: { label: string; tone: RecentActivityRow['statusTone'] } = { label: 'Yeni', tone: 'open' };
    if (raw === 'preparing' || raw === 'ready') st = { label: 'Hazırlanıyor', tone: 'preparing' };
    if (raw === 'delivered' || raw === 'completed') st = { label: 'Tamamlandı', tone: 'done' };
    if (raw === 'cancelled') st = { label: 'İptal', tone: 'neutral' };
    return {
      id: `on-${o.id}`,
      kind: 'online',
      title: String(o.customer_name || 'Online sipariş'),
      subtitle: o.platform_order_number ? `#${o.platform_order_number}` : 'Platform',
      amount: Number(o.total_amount) || 0,
      status: st.label,
      statusTone: st.tone,
      created_at: String(o.created_at || ''),
    };
  });

  return [...orderRows, ...onlineRows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** Masa (dine_in) + hızlı satış (counter) — online/paket hariç */
const TOP_SELLER_ORDER_TYPES = ['dine_in', 'counter'] as const;

async function fetchOrderItemsForTopSellers(
  tenantId: string,
  orderIds: string[],
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const chunkSize = 80;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('order_items')
      .select('product_id, quantity, total_amount, products(name)')
      .eq('tenant_id', tenantId)
      .in('order_id', chunk);
    if (error) break;
    if (data?.length) all.push(...(data as Record<string, unknown>[]));
  }
  return all;
}

export async function fetchElectronTopSellers(
  tenantId: string,
  branchId: string | null,
  limit = 10,
): Promise<TopSellerRow[]> {
  if (isSqlServerMode() || !branchId) return [];

  const today = dayBounds(0);
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .in('order_type', [...TOP_SELLER_ORDER_TYPES])
    .neq('status', 'cancelled')
    .gte('created_at', today.start)
    .lte('created_at', today.end);

  if (ordersErr || !orders?.length) return [];

  const orderIds = orders.map((o) => String((o as { id: string }).id));
  const items = await fetchOrderItemsForTopSellers(tenantId, orderIds);
  if (!items.length) return [];

  const agg = new Map<string, TopSellerRow>();
  for (const item of items) {
    const productId = String(item.product_id || 'unknown');
    const products = item.products as { name?: string } | null;
    const name = products?.name || 'Ürün';
    const qty = Number(item.quantity) || 0;
    const rev = Number(item.total_amount) || 0;
    if (qty <= 0 && rev <= 0) continue;
    const prev = agg.get(productId);
    if (prev) {
      prev.quantity += qty;
      prev.revenue += rev;
    } else {
      agg.set(productId, { productId, name, quantity: qty, revenue: rev });
    }
  }

  return [...agg.values()].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity).slice(0, limit);
}

export type ElectronHomeBundle = {
  stats: DashboardSnapshot;
  recent: RecentActivityRow[];
  topSellers: TopSellerRow[];
};

export async function fetchElectronHomeBundle(
  tenantId: string,
  branchId: string | null,
): Promise<ElectronHomeBundle> {
  const [stats, recent, topSellers] = await Promise.all([
    fetchElectronDashboardSnapshot(tenantId, branchId),
    fetchElectronRecentActivity(tenantId, branchId, 8),
    fetchElectronTopSellers(tenantId, branchId, 10),
  ]);
  return { stats, recent, topSellers };
}

/** Electron acilisinda arka planda cagrilir; ana sayfa aninda cache'den dolar. */
export function preloadElectronHomeData(tenantId: string, branchId: string): void {
  void fetchElectronHomeBundle(tenantId, branchId).then((bundle) => {
    writeElectronHomeCache(tenantId, branchId, bundle);
  });
}

export function formatDashboardDateLabel(): string {
  return dayBounds(0).label;
}

export function formatRelativeTr(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then);
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'Az önce';
    if (min < 60) return `${min} dakika önce`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} saat önce`;
    return new Date(iso).toLocaleDateString('tr-TR');
  } catch {
    return '';
  }
}

export function formatMoneyTr(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function revenueChangePct(today: number, yesterday: number): number | null {
  if (yesterday <= 0) return today > 0 ? 100 : null;
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
}
