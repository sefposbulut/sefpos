import { supabase } from './supabase';
import { ORDER_ITEMS_PANEL_SELECT } from './orderOptimistic';

const warmRows = new Map<string, { rows: any[] }>();
const inflightItems = new Map<string, Promise<void>>();

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

/** Masa seçilir seçilmez sepet satırlarını çek; panel mount olunca `takeWarmOrderItems` ile anında boyanır */
export function warmOrderItemsForPanel(orderId: string | null | undefined) {
  if (!orderId || inflightItems.has(orderId)) return;

  const p = (async () => {
    try {
      let r = await supabase.from('order_items').select(ORDER_ITEMS_PANEL_SELECT).eq('order_id', orderId);
      if (r.error) {
        r = await supabase.from('order_items').select('*, products(*, categories(*))').eq('order_id', orderId);
      }
      if (r.data) {
        const rows = r.data as any[];
        warmRows.set(orderId, { rows });
        persistOrderItemsSnapshot(orderId, rows);
      }
    } finally {
      inflightItems.delete(orderId);
    }
  })();

  inflightItems.set(orderId, p);
}

/** Önbellekte hazırsa satırları okur (silmez) — useLayoutEffect ile ilk karede sepet boyanır */
export function peekWarmOrderItems(orderId: string): any[] | null {
  const e = warmRows.get(orderId);
  if (!e) return null;
  return e.rows;
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
          persistOrderItemsSnapshot(oid, rows);
        }
      }
    } finally {
      inflightBulk.delete(key);
    }
  })();

  inflightBulk.set(key, p);
}
