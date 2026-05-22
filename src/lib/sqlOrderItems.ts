import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';
import { ORDER_ITEMS_PANEL_SELECT } from './orderOptimistic';

/** SQL Server: join yerine düz kolonlar + ürün zenginleştirme */
export const ORDER_ITEMS_SQL_SELECT =
  'id, tenant_id, order_id, product_id, variant_id, variant_name, quantity, unit_price, tax_rate, discount_amount, total_amount, notes, created_at, paid_quantity, paid_at';

const PRODUCT_PANEL_COLS =
  'id, name, price, category_id, tax_rate, unit, barcode, printer_name, scale_enabled';

function normalizeInsertRows(data: unknown): any[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/** PostgREST insert cevabı: SQL modunda tek satır nesne gelebilir */
export function normalizeSqlInsertResult(data: unknown): any[] {
  return normalizeInsertRows(data);
}

export async function enrichOrderItemsWithProducts(items: any[]): Promise<any[]> {
  if (!items?.length) return items;

  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  if (!pids.length) {
    return items.map((row) => ({
      ...row,
      products: row.products || { id: row.product_id, name: 'Ürün' },
    }));
  }

  let products: any[] = [];
  if (isSqlServerMode()) {
    const { data: prods } = await supabase.from('products').select(PRODUCT_PANEL_COLS).in('id', pids);
    products = (prods || []) as any[];
    const cids = [...new Set(products.map((p) => p.category_id).filter(Boolean))] as string[];
    if (cids.length) {
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, vat_rate, hugin_department_id')
        .in('id', cids);
      const catMap = new Map((cats || []).map((c: any) => [c.id, c]));
      products = products.map((p) => ({
        ...p,
        categories: p.category_id ? catMap.get(p.category_id) ?? null : null,
      }));
    }
  } else {
    const { data: prods } = await supabase
      .from('products')
      .select(`${PRODUCT_PANEL_COLS}, categories(id, name, vat_rate, hugin_department_id)`)
      .in('id', pids);
    products = (prods || []) as any[];
  }

  const pmap = new Map(products.map((p) => [p.id, p]));
  return items.map((row) => ({
    ...row,
    products: pmap.get(row.product_id) || row.products || { id: row.product_id, name: 'Ürün' },
  }));
}

const ORDER_ITEMS_SQL_MIN_SELECT =
  'id, order_id, quantity, unit_price, total_amount, notes, created_at';

export async function fetchOrderPanelItems(orderId: string): Promise<any[]> {
  if (isSqlServerMode()) {
    let { data, error } = await supabase
      .from('order_items')
      .select(ORDER_ITEMS_SQL_SELECT)
      .eq('order_id', orderId);
    if (error && /product_id|tenant_id|variant_id/i.test(error.message || '')) {
      const fb = await supabase
        .from('order_items')
        .select(ORDER_ITEMS_SQL_MIN_SELECT)
        .eq('order_id', orderId);
      data = fb.data;
      error = fb.error;
    }
    if (error) {
      console.warn('[sql] order_items yukleme:', error.message);
      return [];
    }
    return enrichOrderItemsWithProducts((data || []) as any[]);
  }

  let r = await supabase.from('order_items').select(ORDER_ITEMS_PANEL_SELECT).eq('order_id', orderId);
  if (r.error) {
    r = await supabase
      .from('order_items')
      .select('*, products(*, categories(*))')
      .eq('order_id', orderId);
  }
  const rows = (r.data || []) as any[];
  return enrichOrderItemsWithProducts(rows);
}

export async function fetchOrderPanelItemsBulk(orderIds: string[]): Promise<Map<string, any[]>> {
  const grouped = new Map<string, any[]>();
  if (!orderIds.length) return grouped;

  if (isSqlServerMode()) {
    const { data, error } = await supabase
      .from('order_items')
      .select(ORDER_ITEMS_SQL_SELECT)
      .in('order_id', orderIds);
    if (error) {
      console.warn('[sql] bulk order_items:', error.message);
      return grouped;
    }
    const enriched = await enrichOrderItemsWithProducts((data || []) as any[]);
    for (const row of enriched) {
      const oid = String(row.order_id || '');
      if (!oid) continue;
      if (!grouped.has(oid)) grouped.set(oid, []);
      grouped.get(oid)!.push(row);
    }
    return grouped;
  }

  let r = await supabase.from('order_items').select(ORDER_ITEMS_PANEL_SELECT).in('order_id', orderIds);
  if (r.error) {
    r = await supabase
      .from('order_items')
      .select('*, products(*, categories(*))')
      .in('order_id', orderIds);
  }
  const enriched = await enrichOrderItemsWithProducts((r.data || []) as any[]);
  for (const row of enriched) {
    const oid = String(row.order_id || '');
    if (!oid) continue;
    if (!grouped.has(oid)) grouped.set(oid, []);
    grouped.get(oid)!.push(row);
  }
  return grouped;
}
