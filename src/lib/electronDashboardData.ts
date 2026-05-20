import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';

export type DashboardSnapshot = {
  openTickets: number;
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

const OPEN_ORDER_STATUSES = ['open', 'active', 'pending'];

export async function fetchElectronDashboardSnapshot(
  tenantId: string,
  branchId: string | null,
): Promise<DashboardSnapshot> {
  const empty: DashboardSnapshot = {
    openTickets: 0,
    occupiedTables: 0,
    totalTables: 0,
    todayRevenue: 0,
    yesterdayRevenue: 0,
    todayOrderCount: 0,
    todayTakeawayCount: 0,
    todayOnlineCount: 0,
    pendingOnlineCount: 0,
  };
  if (isSqlServerMode()) return empty;

  const today = dayBounds(0);
  const yesterday = dayBounds(-1);

  let tablesQ = supabase
    .from('restaurant_tables')
    .select('id, status, current_order_id', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (branchId) tablesQ = tablesQ.eq('branch_id', branchId);

  let ordersTodayQ = supabase
    .from('orders')
    .select('id, status, total_amount, order_type')
    .eq('tenant_id', tenantId)
    .gte('created_at', today.start)
    .lte('created_at', today.end);
  if (branchId) ordersTodayQ = ordersTodayQ.eq('branch_id', branchId);

  let ordersYesterdayQ = supabase
    .from('orders')
    .select('total_amount, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('created_at', yesterday.start)
    .lte('created_at', yesterday.end);
  if (branchId) ordersYesterdayQ = ordersYesterdayQ.eq('branch_id', branchId);

  let openOrdersQ = supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', OPEN_ORDER_STATUSES);
  if (branchId) openOrdersQ = openOrdersQ.eq('branch_id', branchId);

  let onlinePendingQ = supabase
    .from('online_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['new', 'scheduled_new', 'verified', 'accepted', 'preparing']);
  if (branchId) onlinePendingQ = onlinePendingQ.eq('branch_id', branchId);

  const [tablesRes, ordersTodayRes, ordersYesterdayRes, openOrdersRes, onlinePendingRes] =
    await Promise.all([tablesQ, ordersTodayQ, ordersYesterdayQ, openOrdersQ, onlinePendingQ]);

  const tables = (tablesRes.data || []) as { id: string; status?: string; current_order_id?: string | null }[];
  const occupied = tables.filter(
    (t) => t.status === 'occupied' || (t.current_order_id != null && t.current_order_id !== ''),
  ).length;
  const withOrder = tables.filter((t) => t.current_order_id).length;

  const todayOrders = ((ordersTodayRes.data || []) as { status: string; total_amount: number; order_type: string }[]);
  const completedToday = todayOrders.filter((o) => o.status === 'completed');
  const todayRevenue = completedToday.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const yesterdayRows = (ordersYesterdayRes.data || []) as { total_amount: number }[];
  const yesterdayRevenue = yesterdayRows.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return {
    openTickets: Math.max(openOrdersRes.count ?? 0, withOrder),
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

export async function fetchElectronRecentActivity(
  tenantId: string,
  branchId: string | null,
  limit = 5,
): Promise<RecentActivityRow[]> {
  if (isSqlServerMode()) return [];

  let ordersQ = supabase
    .from('orders')
    .select('id, order_number, status, total_amount, order_type, created_at, table_id, restaurant_tables(table_number)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (branchId) ordersQ = ordersQ.eq('branch_id', branchId);

  let onlineQ = supabase
    .from('online_orders')
    .select('id, customer_name, status, total_amount, created_at, platform_order_number')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (branchId) onlineQ = onlineQ.eq('branch_id', branchId);

  const [{ data: orders }, { data: online }] = await Promise.all([ordersQ, onlineQ]);

  const mapOrderStatus = (status: string): { label: string; tone: RecentActivityRow['statusTone'] } => {
    if (status === 'completed') return { label: 'Tamamlandı', tone: 'done' };
    if (status === 'cancelled') return { label: 'İptal', tone: 'neutral' };
    if (status === 'active' || status === 'open') return { label: 'Açık', tone: 'open' };
    if (status === 'pending') return { label: 'Hazırlanıyor', tone: 'preparing' };
    return { label: status, tone: 'neutral' };
  };

  const orderRows: RecentActivityRow[] = (orders || []).map((o: Record<string, unknown>) => {
    const tbl = o.restaurant_tables as { table_number?: string | number } | null;
    const tableNum = tbl?.table_number;
    const st = mapOrderStatus(String(o.status || ''));
    const orderType = String(o.order_type || '');
    return {
      id: `o-${o.id}`,
      kind: orderType === 'takeaway' ? 'takeaway' : 'table',
      title: tableNum != null ? `Masa ${tableNum}` : `Sipariş #${o.order_number || '—'}`,
      subtitle: orderType === 'takeaway' ? 'Paket servis' : 'Salon',
      amount: Number(o.total_amount) || 0,
      status: st.label,
      statusTone: st.tone,
      created_at: String(o.created_at || ''),
    };
  });

  const onlineRows: RecentActivityRow[] = (online || []).map((o: Record<string, unknown>) => {
    const raw = String(o.status || '');
    let st = { label: 'Yeni', tone: 'open' as const };
    if (raw === 'preparing' || raw === 'ready') st = { label: 'Hazırlanıyor', tone: 'preparing' };
    if (raw === 'delivered' || raw === 'completed') st = { label: 'Tamamlandı', tone: 'done' };
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
