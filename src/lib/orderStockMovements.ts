import { supabase } from './supabase';

type StockLine = {
  product_id: string;
  quantity: number;
  unit_cost?: number;
};

type ApplyStockParams = {
  tenantId: string;
  branchId: string | null;
  orderId: string;
  orderNumber: string;
  items: Array<{ product_id: string; quantity: number; products?: { cost?: number | null } | null }>;
};

/** Satış siparişi stok düşümü — ürün başına 5–6 istek yerine toplu okuma + toplu yazma. */
export async function applyOrderStockMovementsBatch(params: ApplyStockParams): Promise<void> {
  const { tenantId, branchId, orderId, orderNumber, items } = params;

  const qtyByProduct = new Map<string, number>();
  const costHint = new Map<string, number>();

  for (const item of items) {
    const qty = Number(item.quantity || 0);
    if (!item.product_id || qty <= 0) continue;
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + qty);
    const hint = Number(item.products?.cost ?? 0);
    if (hint > 0) costHint.set(item.product_id, hint);
  }

  const productIds = [...qtyByProduct.keys()];
  if (productIds.length === 0) return;

  const { data: existingMoves } = await supabase
    .from('stock_movements')
    .select('product_id')
    .eq('tenant_id', tenantId)
    .eq('reference_type', 'sale_order')
    .eq('reference_no', orderId)
    .in('product_id', productIds);

  const alreadyApplied = new Set((existingMoves || []).map((m: { product_id: string }) => m.product_id));
  const todoIds = productIds.filter((id) => !alreadyApplied.has(id));
  if (todoIds.length === 0) return;

  const [{ data: productRows }, branchStockRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, stock_quantity, cost')
      .eq('tenant_id', tenantId)
      .in('id', todoIds),
    branchId
      ? supabase
          .from('branch_product_stocks')
          .select('product_id, quantity')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branchId)
          .in('product_id', todoIds)
      : Promise.resolve({ data: [] as { product_id: string; quantity: number | null }[], error: null }),
  ]);

  const productMap = new Map((productRows || []).map((p: { id: string; stock_quantity?: number | null; cost?: number | null }) => [p.id, p]));
  const branchQtyMap = new Map(
    ((branchStockRes.data || []) as { product_id: string; quantity?: number | null }[]).map((b) => [
      b.product_id,
      Number(b.quantity || 0),
    ]),
  );

  const productUpdates: Promise<unknown>[] = [];
  const branchUpserts: Record<string, unknown>[] = [];
  const movementInserts: Record<string, unknown>[] = [];

  for (const productId of todoIds) {
    const qty = qtyByProduct.get(productId) || 0;
    const productRow = productMap.get(productId);
    if (productRow) {
      const current = Number(productRow.stock_quantity || 0);
      const next = Math.max(0, current - qty);
      productUpdates.push(
        supabase
          .from('products')
          .update({ stock_quantity: next })
          .eq('id', productId)
          .eq('tenant_id', tenantId),
      );
    }

    if (branchId) {
      const currentBranchQty = branchQtyMap.get(productId) ?? 0;
      branchUpserts.push({
        tenant_id: tenantId,
        branch_id: branchId,
        product_id: productId,
        quantity: Math.max(0, currentBranchQty - qty),
      });
    }

    const unitCost = Number(productRow?.cost ?? costHint.get(productId) ?? 0);
    movementInserts.push({
      tenant_id: tenantId,
      product_id: productId,
      movement_type: 'out',
      quantity: qty,
      unit_cost: unitCost,
      total_cost: Number((unitCost * qty).toFixed(2)),
      source_branch_id: branchId,
      reference_type: 'sale_order',
      reference_no: orderId,
      note: `Satis siparisi #${orderNumber}`,
    });
  }

  const writes: Promise<unknown>[] = [];
  if (productUpdates.length) writes.push(Promise.all(productUpdates));
  if (branchUpserts.length) {
    writes.push(
      supabase.from('branch_product_stocks').upsert(branchUpserts, {
        onConflict: 'tenant_id,branch_id,product_id',
      }),
    );
  }
  if (movementInserts.length) {
    writes.push(supabase.from('stock_movements').insert(movementInserts as any));
  }

  await Promise.all(writes);
}
