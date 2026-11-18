import { supabase } from './supabase';
import { ensureCashRegisterRowForPayment } from './cashRegisterFallback';

export type DbPaymentMethod = 'cash' | 'credit_card' | 'open_account';

/** Sipariş formundaki cash | card | online | open_account → payment_transactions */
export function mapTakeawayPaymentMethod(method: string | null | undefined): DbPaymentMethod {
  if (method === 'card' || method === 'online' || method === 'credit_card') return 'credit_card';
  if (method === 'open_account' || method === 'account') return 'open_account';
  return 'cash';
}

export function takeawayTableLabel(orderType: string, orderSubtype: string | null | undefined): string {
  if (orderType === 'delivery') return 'Teslimat';
  if (orderSubtype === 'gel_al') return 'Gel-Al';
  return 'Paket Servis';
}

/**
 * Paket / teslimat ödemesini payment_transactions + kasaya yazar.
 * Açık hesapta customer_transactions (borç) + bakiye güncellenir.
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
  /** Açık hesap için zorunlu */
  customerId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.shouldRecord || input.amount <= 0) {
    return { ok: true };
  }

  const dbMethod = mapTakeawayPaymentMethod(input.paymentMethod);
  if (dbMethod === 'open_account' && !input.customerId) {
    return { ok: false, error: 'Açık hesap için cari müşteri seçilmeli.' };
  }

  const { count, error: countErr } = await supabase
    .from('payment_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', input.orderId);

  if (countErr) {
    console.warn('[takeawayPayment] count failed:', countErr.message);
    return { ok: false, error: countErr.message };
  }
  if ((count ?? 0) > 0) return { ok: true };

  const { data: inserted, error } = await supabase
    .from('payment_transactions')
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      payment_method: dbMethod,
      amount: input.amount,
      created_by: input.createdBy,
      ...(dbMethod === 'open_account' && input.customerId
        ? { customer_id: input.customerId }
        : {}),
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[takeawayPayment] insert failed:', error.message);
    return { ok: false, error: error.message };
  }

  if (dbMethod === 'open_account' && input.customerId && inserted?.id) {
    const note = `${takeawayTableLabel(input.orderType, input.orderSubtype)} · Sipariş #${input.orderNumber}`;
    const { error: txErr } = await supabase.from('customer_transactions').insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      order_id: input.orderId,
      type: 'debt',
      amount: input.amount,
      note,
      created_by: input.createdBy,
    });
    if (txErr) {
      console.warn('[takeawayPayment] cari tx failed:', txErr.message);
      return { ok: false, error: txErr.message };
    }
    const { data: custFresh } = await supabase
      .from('customers')
      .select('current_balance')
      .eq('id', input.customerId)
      .maybeSingle();
    const newBal = (Number(custFresh?.current_balance) || 0) + input.amount;
    const { error: upErr } = await supabase
      .from('customers')
      .update({ current_balance: newBal })
      .eq('id', input.customerId);
    if (upErr) {
      console.warn('[takeawayPayment] cari balance failed:', upErr.message);
      return { ok: false, error: upErr.message };
    }
  } else {
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

  return { ok: true };
}
