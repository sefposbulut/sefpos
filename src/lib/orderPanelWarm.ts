import { supabase } from './supabase';
import { ORDER_ITEMS_PANEL_SELECT } from './orderOptimistic';

const warmRows = new Map<string, { rows: any[] }>();
const inflightItems = new Map<string, Promise<void>>();

export type PanelWarmBundle = {
  rows: any[];
  order: Record<string, unknown> | null;
  payments: any[];
};

const warmPanel = new Map<string, PanelWarmBundle>();
const inflightPanel = new Map<string, Promise<void>>();

const ORDER_PANEL_SELECT =
  'id, order_number, subtotal, discount_amount, total_amount, payment_status, status, waiter_name, branch_id, table_id, order_type, customer_name, customer_phone, delivery_address, delivery_note, courier_name, estimated_delivery_minutes, paid_at, created_at, tenant_id';

async function fetchPanelItems(orderId: string): Promise<any[]> {
  let r = await supabase.from('order_items').select(ORDER_ITEMS_PANEL_SELECT).eq('order_id', orderId);
  if (r.error) {
    r = await supabase
      .from('order_items')
      .select('*, products(*, categories(*))')
      .eq('order_id', orderId);
  }
  return (r.data || []) as any[];
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
    sessionStorage.setItem(SNAPSHOT_PREFIX + orderId, JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}

/** Masa tıklanınca sepet + sipariş + ödemeleri tek seferde önbelleğe al */
export function warmOrderPanelBundle(orderId: string | null | undefined) {
  if (!orderId || inflightPanel.has(orderId)) return;

  const p = (async () => {
    try {
      const [rows, orderRes, payRes] = await Promise.all([
        fetchPanelItems(orderId),
        supabase.from('orders').select(ORDER_PANEL_SELECT).eq('id', orderId).maybeSingle(),
        supabase
          .from('payment_transactions')
          .select('id, tenant_id, order_id, payment_method, amount, created_by, created_at, customer_id')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),
      ]);
      const bundle: PanelWarmBundle = {
        rows,
        order: (orderRes.data as Record<string, unknown>) || null,
        payments: (payRes.data || []) as any[],
      };
      warmPanel.set(orderId, bundle);
      warmRows.set(orderId, { rows });
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

export function bulkWarmOrderItemsForOrders(orderIds: (string | null | undefined)[]) {
  const unique = Array.from(new Set(orderIds.filter((x): x is string => !!x)));
  if (unique.length === 0) return;
  const todo = unique.filter((id) => !warmRows.has(id) && !inflightItems.has(id));
  if (todo.length === 0) return;

  const key = todo.slice().sort().join(',');
  if (inflightBulk.has(key)) return;

  const p = (async () => {
    try {
      let r = await supabase.from('order_items').select(ORDER_ITEMS_PANEL_SELECT).in('order_id', todo);
      if (r.error) {
        r = await supabase
          .from('order_items')
          .select('*, products(*, categories(*))')
          .in('order_id', todo);
      }
      if (r.data) {
        const grouped = new Map<string, any[]>();
        for (const row of r.data as any[]) {
          const oid = String(row.order_id || '');
          if (!oid) continue;
          if (!grouped.has(oid)) grouped.set(oid, []);
          grouped.get(oid)!.push(row);
        }
        for (const oid of todo) {
          const rows = grouped.get(oid) || [];
          warmRows.set(oid, { rows });
          warmPanel.set(oid, { rows, order: warmPanel.get(oid)?.order ?? null, payments: warmPanel.get(oid)?.payments ?? [] });
          persistOrderItemsSnapshot(oid, rows);
        }
      }
    } finally {
      inflightBulk.delete(key);
    }
  })();

  inflightBulk.set(key, p);
}
