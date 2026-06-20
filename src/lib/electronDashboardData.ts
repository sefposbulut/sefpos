import { supabase } from './supabase';
import { writeElectronHomeCache, readElectronHomeCache, isElectronHomeCacheFresh } from './electronHomeCache';

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
  /** Salon / paket — `orders.id` */
  orderId?: string;
  /** Platform siparişi — `online_orders.id` */
  onlineOrderId?: string;
  orderNumber?: string | number | null;
  tableId?: string | null;
  rawStatus?: string;
  /** Liste alt satırı için ödeme özeti */
  paymentHint?: string;
};

/** Son işlem satırından gerçek UUID (önbellek eski satırlar için). */
export function parseRecentActivityRefId(row: RecentActivityRow): {
  orderId?: string;
  onlineOrderId?: string;
} {
  if (row.onlineOrderId) return { onlineOrderId: row.onlineOrderId };
  if (row.orderId) return { orderId: row.orderId };
  if (row.id.startsWith('on-')) return { onlineOrderId: row.id.slice(3) };
  if (row.id.startsWith('o-')) return { orderId: row.id.slice(2) };
  return {};
}

export function formatPaymentMethodLabel(method: string | null | undefined): string {
  const m = String(method || '').toLowerCase().trim();
  if (!m) return '';
  if (m === 'cash') return 'Nakit';
  if (m === 'credit_card' || m === 'card') return 'Kart';
  if (m === 'open_account') return 'Cari hesap';
  if (m === 'online') return 'Online ödeme';
  if (m === 'mixed') return 'Karma ödeme';
  return method || '';
}

export function formatOrderPaymentStatus(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'paid') return 'Ödendi';
  if (s === 'partial') return 'Kısmi ödeme';
  if (s === 'unpaid') return 'Ödenmedi';
  return '';
}

function salonOrderPaymentHint(o: Record<string, unknown>): string {
  const method = formatPaymentMethodLabel(o.payment_method as string);
  if (method) return method;
  const ps = formatOrderPaymentStatus(o.payment_status as string);
  if (ps) return ps;
  const st = String(o.status || '').toLowerCase();
  if (st === 'active' || st === 'open') return 'Ödenmedi';
  return '';
}

export type TopSellerRow = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

function dayBounds(offsetDays = 0): { start: string; end: string; label: string } {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  const start = d.toISOString();
  const endDate = new Date(d);
  endDate.setHours(23, 59, 59, 999);
  return {
    start,
    end: endDate.toISOString(),
    label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/** Online/paket platform siparişi değil — salon + tezgâh */
function isSalonOrderForTopSellers(orderType: string | null | undefined): boolean {
  const t = String(orderType || 'dine_in').toLowerCase();
  return t !== 'delivery';
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
  if (!branchId) return empty;

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

  // online_orders şemasında branch_id yok — yalnızca tenant
  let onlinePendingQ = supabase
    .from('online_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
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
  if (!branchId) return [];

  const perSource = Math.max(limit, 8);

  const [ordersRes, onlineRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, status, total_amount, order_type, created_at, table_id, payment_method, payment_status')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(perSource),
    supabase
      .from('online_orders')
      .select('id, customer_name, status, total_amount, created_at, platform_order_number, payment_status')
      .eq('tenant_id', tenantId)
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
    const baseSub = orderType === 'takeaway' ? 'Paket servis' : 'Salon';
    const payHint = salonOrderPaymentHint(o);
    return {
      id: `o-${o.id}`,
      kind: orderType === 'takeaway' ? 'takeaway' : 'table',
      title: tableNum != null && tableNum !== '' ? `Masa ${tableNum}` : `Sipariş #${o.order_number || '—'}`,
      subtitle: payHint ? `${baseSub} · ${payHint}` : baseSub,
      paymentHint: payHint || undefined,
      amount: Number(o.total_amount) || 0,
      status: st.label,
      statusTone: st.tone,
      created_at: String(o.created_at || ''),
      orderId: String(o.id),
      orderNumber: o.order_number as string | number | null,
      tableId: o.table_id ? String(o.table_id) : null,
      rawStatus: String(o.status || ''),
    };
  });

  const onlineRows: RecentActivityRow[] = (onlineRes.data || []).map((o: Record<string, unknown>) => {
    const raw = String(o.status || '');
    let st: { label: string; tone: RecentActivityRow['statusTone'] } = { label: 'Yeni', tone: 'open' };
    if (raw === 'preparing' || raw === 'ready') st = { label: 'Hazırlanıyor', tone: 'preparing' };
    if (raw === 'delivered' || raw === 'completed') st = { label: 'Tamamlandı', tone: 'done' };
    if (raw === 'cancelled') st = { label: 'İptal', tone: 'neutral' };
    const onlinePay =
      raw === 'delivered' || raw === 'completed'
        ? formatOrderPaymentStatus(String(o.payment_status || 'paid')) || 'Platform ödemeli'
        : 'Platform';
    const subBase = o.platform_order_number ? `#${o.platform_order_number}` : 'Platform';
    return {
      id: `on-${o.id}`,
      kind: 'online',
      title: String(o.customer_name || 'Online sipariş'),
      subtitle: `${subBase} · ${onlinePay}`,
      paymentHint: onlinePay,
      amount: Number(o.total_amount) || 0,
      status: st.label,
      statusTone: st.tone,
      created_at: String(o.created_at || ''),
      onlineOrderId: String(o.id),
      rawStatus: raw,
    };
  });

  return [...orderRows, ...onlineRows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

type OrderWithItems = {
  id?: string;
  order_type?: string | null;
  status?: string;
  order_items?: Array<{
    product_id?: string;
    quantity?: number;
    total_amount?: number;
    cancelled_at?: string | null;
    products?: { name?: string } | null;
  }>;
};

async function loadProductNames(tenantId: string, productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!productIds.length) return map;
  const chunkSize = 80;
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from('products')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', chunk);
    for (const p of data || []) {
      map.set(String((p as { id: string }).id), String((p as { name?: string }).name || 'Ürün'));
    }
  }
  return map;
}

/** Gün sonu raporu ile aynı gömülü select — PostgREST order_items(*) güvenilir */
async function fetchTodayOrdersWithItems(
  tenantId: string,
  branchId: string,
  dayStart: string,
  dayEnd: string,
): Promise<OrderWithItems[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_type, status, order_items(*, products(name))')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) {
    console.warn('[fetchElectronTopSellers] orders', error.message);
    return [];
  }
  return (data || []) as OrderWithItems[];
}

/** İç içe select kalemsiz dönerse doğrudan order_items */
async function fetchOrderItemsForOrderIds(
  tenantId: string,
  orderIds: string[],
): Promise<OrderWithItems['order_items']> {
  const all: NonNullable<OrderWithItems['order_items']> = [];
  const chunkSize = 80;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    let { data, error } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_amount, unit_price, cancelled_at')
      .in('order_id', chunk);
    if (error) {
      const fallback = await supabase
        .from('order_items')
        .select('order_id, quantity, total_amount, unit_price, cancelled_at')
        .in('order_id', chunk);
      data = fallback.data;
      error = fallback.error;
    }
    if (error) {
      console.warn('[fetchElectronTopSellers] order_items', error.message);
      break;
    }
    if (data?.length) all.push(...(data as NonNullable<OrderWithItems['order_items']>));
  }
  return all;
}

function aggregateTopSellersFromOrders(
  orders: OrderWithItems[],
  productNameById: Map<string, string>,
): TopSellerRow[] {
  const agg = new Map<string, TopSellerRow>();

  const bump = (item: {
    product_id?: string;
    quantity?: number;
    total_amount?: number;
    cancelled_at?: string | null;
    products?: { name?: string } | null;
  }) => {
    if (item.cancelled_at) return;
    const productId = String(item.product_id || '');
    if (!productId) return;
    const qty = Number(item.quantity) || 0;
    let rev = Number(item.total_amount) || 0;
    if (rev <= 0 && qty > 0) {
      rev = qty * (Number((item as { unit_price?: number }).unit_price) || 0);
    }
    if (qty <= 0 && rev <= 0) return;
    const name = item.products?.name || productNameById.get(productId) || 'Ürün';
    const prev = agg.get(productId);
    if (prev) {
      prev.quantity += qty;
      prev.revenue += rev;
    } else {
      agg.set(productId, { productId, name, quantity: qty, revenue: rev });
    }
  };

  for (const order of orders) {
    if (!isSalonOrderForTopSellers(order.order_type)) continue;
    if (order.status === 'cancelled') continue;
    for (const item of order.order_items || []) {
      bump(item);
    }
  }
  return [...agg.values()].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);
}

export async function fetchElectronTopSellers(
  tenantId: string,
  branchId: string | null,
  limit = 10,
): Promise<TopSellerRow[]> {
  if (!branchId) return [];

  const today = dayBounds(0);
  let orders = await fetchTodayOrdersWithItems(tenantId, branchId, today.start, today.end);

  const needsItemFetch = orders.filter((o) => !(o.order_items?.length));
  if (needsItemFetch.length > 0) {
    const items = await fetchOrderItemsForOrderIds(
      tenantId,
      needsItemFetch.map((o) => String(o.id)),
    );
    const byOrder = new Map<string, NonNullable<OrderWithItems['order_items']>>();
    for (const it of items || []) {
      const oid = String((it as { order_id?: string }).order_id || '');
      if (!oid) continue;
      const list = byOrder.get(oid) || [];
      list.push(it);
      byOrder.set(oid, list);
    }
    orders = orders.map((o) => ({
      ...o,
      order_items: o.order_items?.length ? o.order_items : byOrder.get(String(o.id)) || [],
    }));
  }

  const productIds = new Set<string>();
  for (const o of orders) {
    for (const it of o.order_items || []) {
      if (it.product_id && !it.products?.name) productIds.add(String(it.product_id));
    }
  }
  const productNameById = await loadProductNames(tenantId, [...productIds]);
  return aggregateTopSellersFromOrders(orders, productNameById).slice(0, limit);
}

export type ElectronHomeBundle = {
  stats: DashboardSnapshot;
  recent: RecentActivityRow[];
  topSellers: TopSellerRow[];
};

const inflightHomeBundle = new Map<string, Promise<ElectronHomeBundle>>();

export async function fetchElectronHomeBundle(
  tenantId: string,
  branchId: string | null,
): Promise<ElectronHomeBundle> {
  if (!branchId) {
    return {
      stats: {
        openTablesWithOrder: 0,
        occupiedTables: 0,
        totalTables: 0,
        todayRevenue: 0,
        yesterdayRevenue: 0,
        todayOrderCount: 0,
        todayTakeawayCount: 0,
        todayOnlineCount: 0,
        pendingOnlineCount: 0,
      },
      recent: [],
      topSellers: [],
    };
  }

  const key = `${tenantId}:${branchId}`;
  if (isElectronHomeCacheFresh(tenantId, branchId)) {
    const cached = readElectronHomeCache(tenantId, branchId);
    if (cached) {
      return { stats: cached.stats, recent: cached.recent, topSellers: cached.topSellers };
    }
  }

  const inflight = inflightHomeBundle.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const [stats, recent, topSellers] = await Promise.all([
      fetchElectronDashboardSnapshot(tenantId, branchId),
      fetchElectronRecentActivity(tenantId, branchId, 8),
      fetchElectronTopSellers(tenantId, branchId, 10),
    ]);
    const bundle = { stats, recent, topSellers };
    writeElectronHomeCache(tenantId, branchId, bundle);
    return bundle;
  })();

  inflightHomeBundle.set(key, promise);
  promise.finally(() => inflightHomeBundle.delete(key));
  return promise;
}

/** @deprecated ElectronDesktopHome kendi yenilemesini yapar — cift fetch yapmayin. */
export function preloadElectronHomeData(_tenantId: string, _branchId: string): void {
  /* no-op: fetchElectronHomeBundle cache + dedupe ElectronDesktopHome icinde */
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
