import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';
import { getActivePosPage } from './pageActivity';

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

function normalizeTableGroupName(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

/** Hibrit SQL'de ayni isimli cift gruplari (BAHÇE/bahce, Masalar/MASALAR) tek sekmeye indirir. */
export function dedupeTableGroupsForDisplay(
  groups: TableGroupCached[],
  tables: TableGridCachedRow[],
): { groups: TableGroupCached[]; tables: TableGridCachedRow[] } {
  if (groups.length < 2) return { groups, tables };

  const tableCount = (gid: string) =>
    tables.filter((t) => String(t.group_id || '') === gid).length;

  const canonicalByName = new Map<string, TableGroupCached>();
  const groupIdRemap = new Map<string, string>();

  for (const g of groups) {
    const key = normalizeTableGroupName(g.name);
    if (!key) continue;
    const existing = canonicalByName.get(key);
    if (!existing) {
      canonicalByName.set(key, g);
      continue;
    }
    const keepExisting = tableCount(existing.id) >= tableCount(g.id);
    const canonical = keepExisting ? existing : g;
    const duplicate = keepExisting ? g : existing;
    canonicalByName.set(key, canonical);
    groupIdRemap.set(duplicate.id, canonical.id);
  }

  if (groupIdRemap.size === 0) return { groups, tables };

  const remappedTables = tables.map((t) => {
    const gid = t.group_id ? String(t.group_id) : '';
    if (!gid || !groupIdRemap.has(gid)) return t;
    return { ...t, group_id: groupIdRemap.get(gid)! };
  });

  const dedupedGroups = Array.from(canonicalByName.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base' }),
  );

  return { groups: dedupedGroups, tables: remappedTables };
}

export const tableGridRuntimeCache = new Map<
  string,
  { tables: TableGridCachedRow[]; groups: TableGroupCached[] }
>();

export function clearTableGridRuntimeCache(): void {
  tableGridRuntimeCache.clear();
}

/** Yalnızca aktif şube önbelleğini tut — şube değişiminde RAM şişmesin. */
export function pruneTableGridRuntimeCache(keepKey: string | null): void {
  if (!keepKey) {
    tableGridRuntimeCache.clear();
    return;
  }
  for (const key of tableGridRuntimeCache.keys()) {
    if (key !== keepKey) tableGridRuntimeCache.delete(key);
  }
}

/** Ayarlar → önbellek temizle: RAM + sessionStorage masa önbelleği. */
export function clearAllTableGridSnapshots(): void {
  clearTableGridRuntimeCache();
  clearSessionTableGridSnapshots();
}

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

/** Sert yenilemede yalnızca session önbelleğini temizle (localStorage + RAM kalır). */
export function prepareTableGridCacheForPageLoad(): void {
  if (!isHardPageReload() || reloadSnapCleared) return;
  reloadSnapCleared = true;
  clearSessionTableGridSnapshots();
  clearTableGridRuntimeCache();
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
 *  cizilir. Sert yenilemede (F5) onbellek kullanilmaz — dogrudan sunucudan cekilir. */
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
    await enrichTableGridOrders(orderMap, { lite: true });
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
    await enrichTableGridOrders(orderMap, { lite: true, alwaysItemSum: true });
  }
  return {
    ...row,
    status: status || 'occupied',
    order: orderMap.get(oid),
  } as TableGridCachedRow;
}

/** orders.total_amount arka plan düzeltmesi — Realtime burst'te DB'yi yorma. */
const lastOrderTotalSyncAt = new Map<string, number>();
const ORDER_TOTAL_SYNC_COOLDOWN_MS = 60_000;

export async function enrichTableGridOrders(
  orderMap: Map<string, TableGridOrderEmbed>,
  opts?: {
    lite?: boolean;
    /** order_items değişince DB total_amount gecikmeli kalabilir */
    alwaysItemSum?: boolean;
    /** Kalemler toplamı orders.total_amount ile uyumsuzsa DB'yi arka planda düzelt */
    syncOrderTotals?: boolean;
  },
): Promise<void> {
  const ids = [...orderMap.keys()].filter((oid) => {
    if (!opts?.lite) return true;
    const embed = orderMap.get(oid);
    if (!embed) return false;
    const ps = embed.payment_status;
    if (ps === 'paid') return false;
    if (ps === 'partial') return true;
    if (opts.alwaysItemSum) return true;
    return !Number(embed.total_amount);
  });
  if (!ids.length) return;

  const paidByOrder = new Map<string, number>();
  const needPayments = opts?.lite
    ? ids.filter((oid) => orderMap.get(oid)?.payment_status === 'partial')
    : ids;
  if (needPayments.length > 0) {
    const { data: payments } = await supabase
      .from('payment_transactions')
      .select('order_id, amount')
      .in('order_id', needPayments);
    for (const p of payments || []) {
      const row = p as { order_id?: string; amount?: number };
      const oid = String(row.order_id || '');
      if (!oid) continue;
      paidByOrder.set(oid, (paidByOrder.get(oid) || 0) + Number(row.amount || 0));
    }
  }

  const needItems = opts?.lite
    ? (opts.alwaysItemSum
      ? ids
      : ids.filter((oid) => !Number(orderMap.get(oid)?.total_amount)))
    : ids;
  const sumByOrder = new Map<string, number>();
  if (needItems.length === 0) {
    for (const [oid, embed] of orderMap) {
      if (!ids.includes(oid)) continue;
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
    return;
  }
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('order_id, total_amount, unit_price, quantity')
    .in('order_id', needItems);
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

  for (const oid of ids) {
    const embed = orderMap.get(oid);
    if (!embed) continue;
    const prevTotal = Number(embed.total_amount || 0);
    if (needItems.includes(oid)) {
      const itemSum = sumByOrder.get(oid) || 0;
      embed.total_amount = itemSum;
      if (
        opts?.syncOrderTotals &&
        Math.abs(itemSum - prevTotal) > 0.009 &&
        embed.payment_status !== 'paid'
      ) {
        const now = Date.now();
        const last = lastOrderTotalSyncAt.get(oid) ?? 0;
        if (now - last >= ORDER_TOTAL_SYNC_COOLDOWN_MS) {
          lastOrderTotalSyncAt.set(oid, now);
          void supabase
            .from('orders')
            .update({ subtotal: itemSum, tax_amount: 0, total_amount: itemSum })
            .eq('id', oid);
        }
      }
    } else if (sumByOrder.has(oid)) {
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
    let groups = (groupsRes.data || []) as TableGroupCached[];
    const deduped = dedupeTableGroupsForDisplay(groups, mapped);
    groups = deduped.groups;
    const finalTables = deduped.tables;
    tableGridRuntimeCache.set(cacheKey, { tables: finalTables, groups });
    persistTableGridSnapshot(cacheKey, { tables: finalTables, groups });
    return { tables: finalTables, groups };
  })();

  inflight.set(cacheKey, promise);
  promise.finally(() => inflight.delete(cacheKey));
  return promise;
}

/** Profil/şube hazır olur olmaz çağır; TableGrid açılmadan cache dolabilir */
export function prefetchCloudTableGrid(tenantId: string, branchId: string): void {
  if (!tenantId || !branchId) return;
  const run = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const page = getActivePosPage();
      if (page !== 'tables' && page !== 'quick-sale') return;
    }
    void fetchCloudTableGridSnapshot(tenantId, branchId).catch(() => {});
  };
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    window.setTimeout(run, 20_000);
    return;
  }
  run();
}
