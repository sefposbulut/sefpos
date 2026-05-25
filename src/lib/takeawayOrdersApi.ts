import { supabase } from './supabase';

/** Liste ekranı: kalemler yüklenmez, yalnızca adet (PostgREST aggregate). */
export const TAKEAWAY_ORDER_LIST_SELECT = `
  id,
  tenant_id,
  branch_id,
  order_number,
  order_type,
  order_subtype,
  status,
  delivery_status,
  customer_name,
  customer_phone,
  delivery_address,
  delivery_note,
  courier_id,
  courier_name,
  payment_method,
  payment_collected,
  total_amount,
  delivery_customer_id,
  estimated_delivery_minutes,
  assigned_at,
  picked_up_at,
  delivered_at,
  created_at,
  waiter_name,
  order_items(count)
`;

export type TakeawayOrderListRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  order_number: string;
  order_type: string;
  order_subtype: string | null;
  status: string;
  delivery_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_note: string | null;
  courier_id: string | null;
  courier_name: string | null;
  payment_method: string | null;
  payment_collected: boolean;
  total_amount: number;
  delivery_customer_id: string | null;
  estimated_delivery_minutes: number | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  waiter_name: string | null;
  order_items?: { count: number }[];
};

export function takeawayItemCount(order: TakeawayOrderListRow): number {
  const c = order.order_items?.[0]?.count;
  return typeof c === 'number' ? c : 0;
}

function takeawayBaseQuery(tenantId: string, branchId: string | null | undefined) {
  let q = supabase
    .from('orders')
    .select(TAKEAWAY_ORDER_LIST_SELECT)
    .eq('tenant_id', tenantId)
    .in('order_type', ['takeaway', 'delivery'])
    .is('table_id', null)
    .order('created_at', { ascending: false });
  if (branchId) q = q.eq('branch_id', branchId);
  return q;
}

/** Aktif paket listesi — tamamlanan/iptal hariç (yoğun gün performansı). */
export async function fetchTakeawayActiveOrders(
  tenantId: string,
  branchId: string | null | undefined,
  limit = 400,
): Promise<TakeawayOrderListRow[]> {
  const q = takeawayBaseQuery(tenantId, branchId)
    .not('status', 'in', '(completed,cancelled)')
    .limit(limit);
  const { data, error } = await q;
  if (error) {
    console.warn('[takeawayOrdersApi] active fetch failed:', error.message);
    return [];
  }
  return (data || []) as TakeawayOrderListRow[];
}

/** Geçmiş sekmesi — yalnızca kapanmış siparişler. */
export async function fetchTakeawayCompletedOrders(
  tenantId: string,
  branchId: string | null | undefined,
  limit = 200,
): Promise<TakeawayOrderListRow[]> {
  const q = takeawayBaseQuery(tenantId, branchId)
    .in('status', ['completed', 'cancelled'])
    .limit(limit);
  const { data, error } = await q;
  if (error) {
    console.warn('[takeawayOrdersApi] completed fetch failed:', error.message);
    return [];
  }
  return (data || []) as TakeawayOrderListRow[];
}

/** @deprecated Aktif + geçmiş birlikte — paket ekranında kullanmayın */
export async function fetchTakeawayOrders(
  tenantId: string,
  branchId: string | null | undefined,
  limit = 1000,
): Promise<TakeawayOrderListRow[]> {
  const q = takeawayBaseQuery(tenantId, branchId).limit(limit);
  const { data, error } = await q;
  if (error) {
    console.warn('[takeawayOrdersApi] fetch failed:', error.message);
    return [];
  }
  return (data || []) as TakeawayOrderListRow[];
}

export async function fetchTakeawayOrderById(
  orderId: string,
): Promise<TakeawayOrderListRow | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(TAKEAWAY_ORDER_LIST_SELECT)
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return null;
  return data as TakeawayOrderListRow;
}
