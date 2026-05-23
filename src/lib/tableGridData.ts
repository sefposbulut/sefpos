import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';

/** SQL + basit sorgu: join gerektirmez */
export const TABLE_GRID_TABLE_COLS =
  'id, table_number, status, current_order_id, session_start, group_id, tenant_id, branch_id, created_at, capacity, size, payment_locked';

/** Masa kutusunda gömülü sipariş (kısmi ödeme için kalan tutar) */
export type TableGridOrderEmbed = {
  id: string;
  total_amount: number;
  order_number: string;
  payment_status?: string | null;
  amount_paid?: number;
  /** Kalan tutar; TableGrid bileşeni bu adı kullanır */
  remaining_amount?: number;
};

export type TableGridCachedRow = Record<string, unknown> & {
  id: string;
  table_number: string | number;
  order?: TableGridOrderEmbed;
};

/** `orders!restaurant_tables_current_order_id_fkey(...)` içi */
export const TABLE_GRID_ORDERS_EMBED_FIELDS =
  'id, total_amount, order_number, payment_status, payment_transactions(amount)';

/** PostgREST join satırından masa kutusu sipariş özetini üretir */
export function buildOrderEmbedFromJoin(ord: unknown): TableGridOrderEmbed | undefined {
  if (!ord || typeof ord !== 'object' || Array.isArray(ord)) return undefined;
  const o = ord as Record<string, unknown>;
  const txs = Array.isArray(o.payment_transactions) ? o.payment_transactions : [];
  const paid = txs.reduce((s: number, p: unknown) => {
    const row = p as { amount?: unknown };
    return s + Number(row?.amount ?? 0);
  }, 0);
  const total = Number(o.total_amount ?? 0);
  return {
    id: String(o.id ?? ''),
    total_amount: total,
    order_number: String(o.order_number ?? ''),
    payment_status: (o.payment_status as string | null | undefined) ?? null,
    amount_paid: paid,
    remaining_amount: Math.max(0, Math.round((total - paid) * 100) / 100),
  };
}

export function mapRestaurantTableJoinRow(t: Record<string, unknown>): TableGridCachedRow {
  const order = buildOrderEmbedFromJoin(t.orders);
  const { orders: _o, ...row } = t;
  return { ...row, order } as TableGridCachedRow;
}

export type TableGroupCached = {
  id: string;
  name: string;
  color: string;
  branch_id: string | null;
  prefix: string | null;
};

export const tableGridRuntimeCache = new Map<
  string,
  { tables: TableGridCachedRow[]; groups: TableGroupCached[] }
>();

const inflight = new Map<string, Promise<{ tables: TableGridCachedRow[]; groups: TableGroupCached[] }>>();

const GRID_SNAP_PREFIX = 'sefpos:table_grid_snap:v1:';
const MAX_GRID_SNAP_CHARS = 3_800_000;
let reloadSnapCleared = false;

/** F5 / Ctrl+R — sessionStorage'daki bayat yeşil masaları göstermemek için. */
export function isHardPageReload(): boolean {
  if (typeof performance === 'undefined') return false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

function clearSessionTableGridSnapshots(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(GRID_SNAP_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Sert yenilemede bir kez session önbelleğini temizle. */
export function prepareTableGridCacheForPageLoad(): void {
  if (!isHardPageReload() || reloadSnapCleared) return;
  reloadSnapCleared = true;
  clearSessionTableGridSnapshots();
  tableGridRuntimeCache.clear();
}
/** localStorage TTL: 7 gün. Bu sürede internet kesintisinde / app restart sonrasi
 *  masalar ve gruplar son bilinen halleriyle anında ekrana gelir. Sonrasinda
 *  bayat veri kullanmamak icin kalici cache silinir. */
const GRID_SNAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SnapshotPayload = {
  tables: TableGridCachedRow[];
  groups: TableGroupCached[];
};

type StoredSnapshot = SnapshotPayload & { savedAt?: number };

function readFromStore(
  store: Storage | null,
  key: string,
  enforceTtl: boolean
): SnapshotPayload | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredSnapshot | null;
    if (!o || !Array.isArray(o.tables) || !Array.isArray(o.groups)) return null;
    if (enforceTtl && typeof o.savedAt === 'number') {
      if (Date.now() - o.savedAt > GRID_SNAP_TTL_MS) {
        store.removeItem(key);
        return null;
      }
    }
    return { tables: o.tables, groups: o.groups };
  } catch {
    return null;
  }
}

/** F5 / sekme yenilemede ve **offline / app restart sonrasinda** izgara aninda
 *  cizilir. Once sessionStorage (en taze), sonra localStorage (TTL'li) kontrol
 *  edilir. Sert yenilemede (F5) bayat dolu masa renkleri gösterilmez. */
export function readPersistedTableGridSnapshot(
  cacheKey: string
): SnapshotPayload | null {
  prepareTableGridCacheForPageLoad();
  if (isHardPageReload()) return null;

  const fromSession = readFromStore(
    typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    GRID_SNAP_PREFIX + cacheKey,
    false
  );
  if (fromSession) return fromSession;
  return readFromStore(
    typeof localStorage !== 'undefined' ? localStorage : null,
    GRID_SNAP_PREFIX + cacheKey,
    true
  );
}

function persistTableGridSnapshot(
  cacheKey: string,
  payload: SnapshotPayload
): void {
  const stored: StoredSnapshot = { ...payload, savedAt: Date.now() };
  let s: string;
  try {
    s = JSON.stringify(stored);
  } catch {
    return;
  }
  if (s.length > MAX_GRID_SNAP_CHARS) return;
  try {
    sessionStorage.setItem(GRID_SNAP_PREFIX + cacheKey, s);
  } catch {
    /* sessionStorage doluysa atla, localStorage'i dene */
  }
  try {
    localStorage.setItem(GRID_SNAP_PREFIX + cacheKey, s);
  } catch {
    /* localStorage quota dolu */
  }
}

function naturalSort(a: TableGridCachedRow, b: TableGridCachedRow) {
  return compareTableNumbers(a.table_number, b.table_number);
}

/** M-2, M-10 gibi numaralari dogal siralar (M-10, M-2 oncesinde degil). */
export function compareTableNumbers(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortRestaurantTablesByNumber<T extends { table_number: string | number }>(
  rows: T[],
): T[] {
  return [...rows].sort((x, y) => compareTableNumbers(x.table_number, y.table_number));
}

/**
 * Şube masalarını ve gruplarını çeker; runtime cache’e yazar.
 * TableGrid ve giriş prefetch aynı fonksiyonu kullanır.
 */
/** Şube masaları — SQL Server'da join kullanmaz (Ayarlar ile aynı veri kaynağı). */
export async function fetchRestaurantTablesForBranch(
  tenantId: string,
  branchId: string,
): Promise<TableGridCachedRow[]> {
  const baseQ = supabase
    .from('restaurant_tables')
    .select(TABLE_GRID_TABLE_COLS)
    .eq('tenant_id', tenantId)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order('table_number');

  if (!isSqlServerMode()) {
    const joinQ = supabase
      .from('restaurant_tables')
      .select(
        `
          ${TABLE_GRID_TABLE_COLS},
          orders!restaurant_tables_current_order_id_fkey(
            ${TABLE_GRID_ORDERS_EMBED_FIELDS}
          )
        `,
      )
      .eq('tenant_id', tenantId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order('table_number');
    const { data, error } = await joinQ;
    if (!error && data) {
      return (data as Record<string, unknown>[]).map((t) => mapRestaurantTableJoinRow(t));
    }
  }

  const { data, error } = await baseQ;
  if (error) {
    console.error('[ŞefPOS] restaurant_tables:', error.message || error);
    return [];
  }
  const rows = (data || []) as Record<string, unknown>[];
  const orderIds = [
    ...new Set(
      rows.map((t) => String(t.current_order_id || '')).filter((id) => id.length > 8),
    ),
  ];
  const orderMap = new Map<string, TableGridOrderEmbed>();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, total_amount, order_number, payment_status')
      .in('id', orderIds);
    for (const o of orders || []) {
      const row = o as Record<string, unknown>;
      orderMap.set(String(row.id), {
        id: String(row.id),
        total_amount: Number(row.total_amount ?? 0),
        order_number: String(row.order_number ?? ''),
        payment_status: (row.payment_status as string | null) ?? null,
      });
    }
    await enrichTableGridOrders(orderMap);
  }
  return rows.map((t) => {
    const oid = t.current_order_id ? String(t.current_order_id) : '';
    const status =
      oid && String(t.status || '') !== 'occupied' ? 'occupied' : (t.status as string | undefined);
    return {
      ...t,
      status,
      order: oid ? orderMap.get(oid) : undefined,
    } as TableGridCachedRow;
  });
}

/** SQL: orders.total_amount 0 iken satirlardan tutar; odemelerden kalan hesapla */
/** Masa taşıma / birleştirme sonrası izgara yenilemesi */
export function dispatchTablesGridReload(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sefpos:tables-changed'));
  }
}

/** Tek masa + gömülü sipariş (SQL join kullanmaz) */
export async function fetchRestaurantTableWithOrder(
  tenantId: string,
  tableId: string,
  branchId?: string | null,
): Promise<TableGridCachedRow | null> {
  let q = supabase
    .from('restaurant_tables')
    .select(TABLE_GRID_TABLE_COLS)
    .eq('tenant_id', tenantId)
    .eq('id', tableId);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const oid = row.current_order_id ? String(row.current_order_id) : '';
  const status =
    oid && String(row.status || '') !== 'occupied' ? 'occupied' : (row.status as string | undefined);
  if (!oid) {
    return { ...row, status: status || 'available' } as TableGridCachedRow;
  }
  const orderMap = new Map<string, TableGridOrderEmbed>();
  const { data: ord } = await supabase
    .from('orders')
    .select('id, total_amount, order_number, payment_status')
    .eq('id', oid)
    .maybeSingle();
  if (ord) {
    const o = ord as Record<string, unknown>;
    orderMap.set(oid, {
      id: oid,
      total_amount: Number(o.total_amount ?? 0),
      order_number: String(o.order_number ?? ''),
      payment_status: (o.payment_status as string | null) ?? null,
    });
    await enrichTableGridOrders(orderMap);
  }
  return {
    ...row,
    status: status || 'occupied',
    order: orderMap.get(oid),
  } as TableGridCachedRow;
}

export async function enrichTableGridOrders(orderMap: Map<string, TableGridOrderEmbed>): Promise<void> {
  const ids = [...orderMap.keys()];
  if (!ids.length) return;

  const paidByOrder = new Map<string, number>();
  const { data: payments } = await supabase
    .from('payment_transactions')
    .select('order_id, amount')
    .in('order_id', ids);
  for (const p of payments || []) {
    const row = p as { order_id?: string; amount?: number };
    const oid = String(row.order_id || '');
    if (!oid) continue;
    paidByOrder.set(oid, (paidByOrder.get(oid) || 0) + Number(row.amount || 0));
  }

  const sumByOrder = new Map<string, number>();
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('order_id, total_amount, unit_price, quantity')
    .in('order_id', ids);
  if (!itemsErr) {
    for (const it of items || []) {
      const row = it as {
        order_id?: string;
        total_amount?: number;
        unit_price?: number;
        quantity?: number;
      };
      const oid = String(row.order_id || '');
      if (!oid) continue;
      const line =
        Number(row.total_amount) > 0
          ? Number(row.total_amount)
          : Number(row.unit_price || 0) * Number(row.quantity || 0);
      sumByOrder.set(oid, (sumByOrder.get(oid) || 0) + line);
    }
  }

  for (const [oid, embed] of orderMap) {
    if (sumByOrder.has(oid)) {
      const itemSum = sumByOrder.get(oid) || 0;
      if (itemSum > 0) embed.total_amount = itemSum;
    } else if (!Number(embed.total_amount)) {
      embed.total_amount = 0;
    }
    const paid = paidByOrder.get(oid) || 0;
    const total = Number(embed.total_amount || 0);
    embed.amount_paid = paid;
    if (paid > 0.01 && paid < total - 0.01) {
      embed.payment_status = 'partial';
      embed.remaining_amount = Math.max(0, Math.round((total - paid) * 100) / 100);
    } else if (paid >= total - 0.01 && total > 0) {
      embed.payment_status = 'paid';
      embed.remaining_amount = 0;
    } else {
      embed.remaining_amount = total;
    }
  }
}

export async function fetchCloudTableGridSnapshot(
  tenantId: string,
  branchId: string
): Promise<{ tables: TableGridCachedRow[]; groups: TableGroupCached[] }> {
  const cacheKey = `${tenantId}:${branchId}`;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const groupQ = supabase
      .from('table_groups')
      .select('id, name, color, branch_id, prefix')
      .eq('tenant_id', tenantId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order('name');

    const [groupsRes, mapped] = await Promise.all([
      groupQ,
      fetchRestaurantTablesForBranch(tenantId, branchId),
    ]);
    mapped.sort(naturalSort);
    const groups = (groupsRes.data || []) as TableGroupCached[];
    tableGridRuntimeCache.set(cacheKey, { tables: mapped, groups });
    persistTableGridSnapshot(cacheKey, { tables: mapped, groups });
    return { tables: mapped, groups };
  })();

  inflight.set(cacheKey, promise);
  promise.finally(() => inflight.delete(cacheKey));
  return promise;
}

/** Profil/şube hazır olur olmaz çağır; TableGrid açılmadan cache dolabilir */
export function prefetchCloudTableGrid(tenantId: string, branchId: string): void {
  if (!tenantId || !branchId) return;
  void fetchCloudTableGridSnapshot(tenantId, branchId).catch(() => {});
}
