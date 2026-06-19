import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';
import { orderTotalsFromItems } from './orderOptimistic';
import { fetchOrderPanelItems, fetchOrderPanelItemsBulk } from './sqlOrderItems';

const warmRows = new Map<string, { rows: any[]; touched: number }>();
const inflightItems = new Map<string, Promise<void>>();

export type PanelWarmBundle = {
  rows: any[];
  order: Record<string, unknown> | null;
  payments: any[];
};

const warmPanel = new Map<string, PanelWarmBundle & { touched: number }>();
const inflightPanel = new Map<string, Promise<void>>();

const MAX_WARM_PANEL_ENTRIES = 24;
const warmTouchOrder: string[] = [];

function touchWarmOrder(orderId: string): void {
  const i = warmTouchOrder.indexOf(orderId);
  if (i >= 0) warmTouchOrder.splice(i, 1);
  warmTouchOrder.push(orderId);
}

function pruneWarmPanelCaches(): void {
  while (warmTouchOrder.length > MAX_WARM_PANEL_ENTRIES) {
    const drop = warmTouchOrder.shift();
    if (!drop) break;
    warmPanel.delete(drop);
    warmRows.delete(drop);
    try {
      sessionStorage.removeItem(SNAPSHOT_PREFIX + drop);
    } catch {
      /* ignore */
    }
  }
}

export const ORDER_PANEL_SELECT =
  'id, order_number, subtotal, discount_amount, total_amount, payment_status, status, waiter_name, branch_id, table_id, order_type, customer_name, customer_phone, delivery_address, delivery_note, courier_name, estimated_delivery_minutes, paid_at, created_at, tenant_id';

export const PAYMENT_TRANSACTION_SELECT =
  'id, order_id, amount, payment_method, created_at, tenant_id, created_by, customer_id';

async function fetchPanelItems(orderId: string): Promise<any[]> {
  return fetchOrderPanelItems(orderId);
}

const SNAPSHOT_PREFIX = 'sefpos:order_items_snap:v1:';

/** F5 / sekme yenilemede senkron okunur — sepet ilk karede görünür (stale-while-revalidate) */
export function readPersistedOrderItemsSnapshot(orderId: string): any[] | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_PREFIX + orderId);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistOrderItemsSnapshot(orderId: string, rows: any[]): void {
  try {
    if (!rows.length) {
      sessionStorage.removeItem(SNAPSHOT_PREFIX + orderId);
      return;
    }
    sessionStorage.setItem(SNAPSHOT_PREFIX + orderId, JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}

/** Sipariş iptal / masa boşaltma sonrası RAM + session önbelleğini temizle */
export function clearWarmOrderPanelCache(orderId: string): void {
  if (!orderId) return;
  warmPanel.delete(orderId);
  warmRows.delete(orderId);
  const i = warmTouchOrder.indexOf(orderId);
  if (i >= 0) warmTouchOrder.splice(i, 1);
  try {
    sessionStorage.removeItem(SNAPSHOT_PREFIX + orderId);
  } catch {
    /* ignore */
  }
}

/** Ödeme / kapanış sonrası toplu temizlik */
export function evictWarmCachesForOrders(orderIds: (string | null | undefined)[]): void {
  for (const id of orderIds) {
    if (id) clearWarmOrderPanelCache(id);
  }
}

/** Masa tıklanınca sepet + sipariş + ödemeleri tek seferde önbelleğe al */
export function warmOrderPanelBundle(orderId: string | null | undefined) {
  if (!orderId) return;
  if (warmPanel.get(orderId)?.rows?.length) return;
  if (inflightPanel.has(orderId)) return;

  const p = (async () => {
    try {
      const [rows, orderRes, payRes] = await Promise.all([
        fetchPanelItems(orderId),
        supabase.from('orders').select(ORDER_PANEL_SELECT).eq('id', orderId).maybeSingle(),
        supabase
          .from('payment_transactions')
          .select(
            isSqlServerMode()
              ? 'id, tenant_id, order_id, payment_method, amount, created_by, created_at'
              : 'id, tenant_id, order_id, payment_method, amount, created_by, created_at, customer_id',
          )
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),
      ]);
      let order = (orderRes.data as Record<string, unknown>) || null;
      if (order && rows.length > 0) {
        order = orderTotalsFromItems(order as any, rows) as Record<string, unknown>;
      }
      const bundle: PanelWarmBundle = {
        rows,
        order,
        payments: (payRes.data || []) as any[],
      };
      warmPanel.set(orderId, { ...bundle, touched: Date.now() });
      warmRows.set(orderId, { rows, touched: Date.now() });
      touchWarmOrder(orderId);
      pruneWarmPanelCaches();
      persistOrderItemsSnapshot(orderId, rows);
    } finally {
      inflightPanel.delete(orderId);
    }
  })();

  inflightPanel.set(orderId, p);
}

/** Geriye uyumluluk — tam panel warm */
export function warmOrderItemsForPanel(orderId: string | null | undefined) {
  warmOrderPanelBundle(orderId);
}

/** Hover / pointerdown — tıklamadan hemen önce yalnızca sepet satırlarını çek (hafif). */
const prefetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function prefetchItemsOnly(orderId: string): Promise<void> {
  if (warmPanel.get(orderId)?.rows?.length || warmRows.get(orderId)?.rows?.length) return;
  if (inflightItems.has(orderId)) return;
  const p = (async () => {
    try {
      const rows = await fetchPanelItems(orderId);
      warmRows.set(orderId, { rows, touched: Date.now() });
      const existing = warmPanel.get(orderId);
      warmPanel.set(orderId, {
        rows,
        order: existing?.order ?? null,
        payments: existing?.payments ?? [],
        touched: Date.now(),
      });
      touchWarmOrder(orderId);
      pruneWarmPanelCaches();
    } finally {
      inflightItems.delete(orderId);
    }
  })();
  inflightItems.set(orderId, p);
}

export function prefetchWarmOrderPanel(orderId: string | null | undefined) {
  if (!orderId) return;
  if (warmPanel.get(orderId)?.rows?.length) return;
  const pending = prefetchTimers.get(orderId);
  if (pending) clearTimeout(pending);
  prefetchTimers.set(
    orderId,
    setTimeout(() => {
      prefetchTimers.delete(orderId);
      void prefetchItemsOnly(orderId);
    }, 150),
  );
}

/** Önbellek veya devam eden warm bitince panel satırlarını uygula */
export function whenWarmOrderPanelReady(orderId: string): Promise<PanelWarmBundle | null> {
  if (!orderId) return Promise.resolve(null);
  const panel = warmPanel.get(orderId);
  if (panel?.rows?.length) return Promise.resolve(panel);
  const rowsEntry = warmRows.get(orderId);
  if (rowsEntry?.rows?.length) {
    return Promise.resolve({
      rows: rowsEntry.rows,
      order: panel?.order ?? null,
      payments: panel?.payments ?? [],
    });
  }
  warmOrderPanelBundle(orderId);
  const inflight = inflightPanel.get(orderId);
  if (!inflight) return Promise.resolve(null);
  return inflight.then(() => warmPanel.get(orderId) ?? null);
}

/** Önbellekte hazırsa satırları okur (silmez) — useLayoutEffect ile ilk karede sepet boyanır */
export function peekWarmOrderItems(orderId: string): any[] | null {
  const panel = warmPanel.get(orderId);
  if (panel) return panel.rows;
  const e = warmRows.get(orderId);
  if (!e) return null;
  return e.rows;
}

export function peekWarmPanelBundle(orderId: string): PanelWarmBundle | null {
  return warmPanel.get(orderId) ?? null;
}

/** Tek seferlik tüket; OrderPanel effect içinde sunucu ile hizalanır */
export function takeWarmOrderItems(orderId: string): { rows: any[] } | undefined {
  const e = warmRows.get(orderId);
  if (!e) return undefined;
  warmRows.delete(orderId);
  return { rows: e.rows };
}

/**
 * Toplu önbellekleme — TableGrid masa listesi her yenilendiğinde aktif
 * sipariş satırlarını TEK sorguda çekip warm cache'e koyar. Kullanıcı
 * herhangi bir masaya tıkladığında OrderPanel mount olur olmaz sepet ilk
 * karede boyanır (network round-trip beklenmez).
 */
const inflightBulk = new Map<string, Promise<void>>();
const BULK_WARM_MAX = 12;
const BULK_WARM_DEBOUNCE_MS = 500;
let bulkWarmTimer: ReturnType<typeof setTimeout> | null = null;
const pendingBulkIds = new Set<string>();

function runBulkWarmBatch(): void {
  const todo = [...pendingBulkIds]
    .filter((id) => {
      if (inflightItems.has(id) || inflightPanel.has(id)) return false;
      if (warmPanel.get(id)?.rows?.length) return false;
      if (warmRows.get(id)?.rows?.length) return false;
      return true;
    })
    .slice(0, BULK_WARM_MAX);
  for (const id of todo) pendingBulkIds.delete(id);
  if (todo.length === 0) {
    if (pendingBulkIds.size > 0) scheduleBulkWarmBatch();
    return;
  }

  const key = todo.slice().sort().join(',');
  if (inflightBulk.has(key)) {
    if (pendingBulkIds.size > 0) scheduleBulkWarmBatch();
    return;
  }

  const p = (async () => {
    try {
      const grouped = await fetchOrderPanelItemsBulk(todo);
      for (const oid of todo) {
        const rows = grouped.get(oid) || [];
        warmRows.set(oid, { rows, touched: Date.now() });
        const prev = warmPanel.get(oid);
        warmPanel.set(oid, {
          rows,
          order: prev?.order ?? null,
          payments: prev?.payments ?? [],
          touched: Date.now(),
        });
        touchWarmOrder(oid);
        persistOrderItemsSnapshot(oid, rows);
      }
      pruneWarmPanelCaches();
    } finally {
      inflightBulk.delete(key);
      if (pendingBulkIds.size > 0) scheduleBulkWarmBatch();
    }
  })();

  inflightBulk.set(key, p);
}

function scheduleBulkWarmBatch(): void {
  const run = () => runBulkWarmBatch();
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 900 });
  } else {
    setTimeout(run, 0);
  }
}

export function bulkWarmOrderItemsForOrders(orderIds: (string | null | undefined)[]) {
  for (const id of orderIds) {
    if (id) pendingBulkIds.add(id);
  }
  if (pendingBulkIds.size === 0) return;
  if (bulkWarmTimer) clearTimeout(bulkWarmTimer);
  bulkWarmTimer = setTimeout(() => {
    bulkWarmTimer = null;
    scheduleBulkWarmBatch();
  }, BULK_WARM_DEBOUNCE_MS);
}
