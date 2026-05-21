import { supabase } from './supabase';
import { ensureCashRegisterRowForPayment } from './cashRegisterFallback';

export type DbPaymentMethod = 'cash' | 'credit_card' | 'open_account';

/** Sipariş formundaki cash | card | online → payment_transactions */
export function mapTakeawayPaymentMethod(method: string | null | undefined): DbPaymentMethod {
  if (method === 'card' || method === 'online') return 'credit_card';
  if (method === 'open_account') return 'open_account';
  return 'cash';
}

export function takeawayTableLabel(orderType: string, orderSubtype: string | null | undefined): string {
  if (orderType === 'delivery') return 'Teslimat';
  if (orderSubtype === 'gel_al') return 'Gel-Al';
  return 'Paket Servis';
}

/**
 * Paket / teslimat ödemesini payment_transactions + kasaya yazar.
 * Aynı sipariş için zaten kayıt varsa tekrar eklemez.
 */
export async function recordTakeawayPaymentIfNeeded(input: {
  tenantId: string;
  branchId: string | null;
  orderId: string;
  orderNumber: string;
  orderType: string;
  orderSubtype: string | null | undefined;
  paymentMethod: string | null | undefined;
  amount: number;
  createdBy: string;
  /** false ise (kapıda ödenecek) kayıt oluşturulmaz */
  shouldRecord: boolean;
}): Promise<void> {
  if (!input.shouldRecord || input.amount <= 0) return;

  const { count, error: countErr } = await supabase
    .from('payment_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', input.orderId);

  if (countErr) {
    console.warn('[takeawayPayment] count failed:', countErr.message);
    return;
  }
  if ((count ?? 0) > 0) return;

  const dbMethod = mapTakeawayPaymentMethod(input.paymentMethod);
  const { data: inserted, error } = await supabase
    .from('payment_transactions')
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      payment_method: dbMethod,
      amount: input.amount,
      created_by: input.createdBy,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[takeawayPayment] insert failed:', error.message);
    return;
  }

  void ensureCashRegisterRowForPayment({
    tenantId: input.tenantId,
    branchId: input.branchId,
    paymentId: inserted?.id ?? null,
    orderId: input.orderId,
    paymentMethod: dbMethod,
    amount: input.amount,
    createdBy: input.createdBy,
    tableLabel: takeawayTableLabel(input.orderType, input.orderSubtype),
    orderNumber: input.orderNumber,
  });
}
