import type { Database } from './supabase';
import type { CartItem } from '../types/posOrder';

type OrderItem = Database['public']['Tables']['order_items']['Row'];
type Product = Database['public']['Tables']['products']['Row'];
type Order = Database['public']['Tables']['orders']['Row'];

export const TEMP_LINE_PREFIX = 'sefpos-temp-line-';
export const TEMP_ORDER_PREFIX = 'sefpos-temp-order';

export type OrderItemWithProduct = OrderItem & { products: Product };

export function isTempLineId(id: string | undefined): boolean {
  return !!id && id.startsWith(TEMP_LINE_PREFIX);
}

export function isTempOrderId(id: string | undefined): boolean {
  return !!id && id.startsWith(TEMP_ORDER_PREFIX);
}

export function buildOptimisticOrderItem(
  item: CartItem,
  tenantId: string,
  orderId: string,
  lineId: string
): OrderItemWithProduct {
  let unitPrice: number;
  let totalAmount: number;
  if (item.weightedPrice !== undefined) {
    totalAmount = item.weightedPrice;
    unitPrice = item.quantity > 0 ? item.weightedPrice / item.quantity : item.product.price;
  } else {
    unitPrice = item.product.price + (item.variant?.price_modifier || 0);
    totalAmount = unitPrice * item.quantity;
  }

  const row: OrderItem = {
    id: lineId,
    tenant_id: tenantId,
    order_id: orderId,
    product_id: item.product.id,
    variant_id: item.variant?.id ?? null,
    variant_name: item.variant?.name ?? null,
    quantity: item.quantity,
    unit_price: unitPrice,
    tax_rate: item.product.tax_rate,
    discount_amount: 0,
    total_amount: totalAmount,
    notes: item.notes ?? null,
    status: 'pending',
    cancellation_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    created_at: new Date().toISOString(),
  } as OrderItem;

  return { ...row, products: item.product };
}

export function buildPlaceholderOrder(params: {
  id: string;
  tenantId: string;
  branchId: string | null;
  table: { id: string; table_number: number };
  userId: string;
  waiterName: string;
  subtotal: number;
}): Order {
  const orderNumber =
    params.table.table_number === 0
      ? `PAKET-${Date.now().toString().slice(-6)}`
      : `M${params.table.table_number}-${Date.now().toString().slice(-6)}`;

  return {
    id: params.id,
    tenant_id: params.tenantId,
    branch_id: params.branchId,
    order_number: orderNumber,
    table_id: params.table.table_number === 0 ? null : params.table.id,
    order_type: params.table.table_number === 0 ? 'takeaway' : 'dine_in',
    status: 'open',
    payment_status: 'unpaid',
    customer_name: null,
    customer_phone: null,
    customer_address: null,
    subtotal: params.subtotal,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: params.subtotal,
    notes: null,
    waiter_id: params.userId,
    waiter_name: params.waiterName,
    courier_id: null,
    delivery_status: null,
    payment_method: null,
    payment_collected: false,
    created_at: new Date().toISOString(),
    completed_at: null,
    paid_at: null,
  } as Order;
}

/** Masa ızgarasındaki orders embed + current_order_id ile ilk karede sepet/ÖDE için anlık yer tutucu */
export function buildGridSnapshotPlaceholderOrder(params: {
  orderId: string;
  tenantId: string;
  branchId: string | null;
  restaurantTableId: string;
  tableNumber: number;
  waiterId: string | null;
  embed?: {
    id: string;
    total_amount: number;
    order_number: string;
    payment_status?: string | null;
  } | null;
}): Order {
  const subtotal = params.embed ? Number(params.embed.total_amount) || 0 : 0;
  const ps = params.embed?.payment_status;
  const payment_status: Order['payment_status'] =
    ps === 'paid' || ps === 'partial' || ps === 'unpaid' || ps === 'pending' ? ps : 'unpaid';

  return {
    id: params.orderId,
    tenant_id: params.tenantId,
    branch_id: params.branchId,
    order_number: params.embed?.order_number ?? '…',
    table_id: params.tableNumber === 0 ? null : params.restaurantTableId,
    order_type: params.tableNumber === 0 ? 'takeaway' : 'dine_in',
    status: 'active',
    payment_status,
    customer_name: null,
    customer_phone: null,
    customer_address: null,
    subtotal,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: subtotal,
    notes: null,
    waiter_id: params.waiterId,
    waiter_name: null,
    courier_id: null,
    delivery_status: null,
    payment_method: null,
    payment_collected: false,
    created_at: new Date().toISOString(),
    completed_at: null,
    paid_at: null,
  } as Order;
}

/** Sipariş paneli listesi: ağır `products(*, categories(*))` yerine sadece gerekli kolonlar */
export const ORDER_ITEMS_PANEL_SELECT =
  'id, tenant_id, order_id, product_id, variant_id, variant_name, quantity, unit_price, tax_rate, discount_amount, total_amount, notes, created_at, products(id, name, price, category_id, tax_rate, unit, barcode, printer_name, scale_enabled, categories(vat_rate, hugin_department_id, name))';
