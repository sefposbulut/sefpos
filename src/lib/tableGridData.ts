import { supabase } from './supabase';

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
 *  edilir. */
export function readPersistedTableGridSnapshot(
  cacheKey: string
): SnapshotPayload | null {
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
  return String(a.table_number).localeCompare(String(b.table_number), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Şube masalarını ve gruplarını çeker; runtime cache’e yazar.
 * TableGrid ve giriş prefetch aynı fonksiyonu kullanır.
 */
export async function fetchCloudTableGridSnapshot(
  tenantId: string,
  branchId: string
): Promise<{ tables: TableGridCachedRow[]; groups: TableGroupCached[] }> {
  const cacheKey = `${tenantId}:${branchId}`;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const tableQ = supabase
      .from('restaurant_tables')
      .select(
        `
          id, table_number, status, current_order_id, session_start,
          group_id, tenant_id, branch_id, created_at, capacity, size, payment_locked,
          orders!restaurant_tables_current_order_id_fkey(
            ${TABLE_GRID_ORDERS_EMBED_FIELDS}
          )
        `
      )
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('table_number');

    const groupQ = supabase
      .from('table_groups')
      .select('id, name, color, branch_id, prefix')
      .eq('tenant_id', tenantId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order('name');

    const [groupsRes, tablesRes] = await Promise.all([groupQ, tableQ]);

    if (tablesRes.error) throw tablesRes.error;

    const mapped: TableGridCachedRow[] = (tablesRes.data || []).map((t: any) =>
      mapRestaurantTableJoinRow(t as Record<string, unknown>)
    );
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
