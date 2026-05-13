import { supabase } from './supabase';

/**
 * Bir `payment_transactions` satırı için kasa satırı oluşmasını **garantiler**:
 *
 *  - DB tetikleyicisi `log_payment_to_cash_register` çalışırsa zaten satır vardır,
 *    bu fonksiyon hiçbir şey yapmaz (çift kayıt olmaz).
 *  - Tetikleyici yoksa / çalışmadıysa uygulama tarafından **bir kez** insert eder.
 *
 * İzolasyon: `tenant_id` + `branch_id` her zaman set edilir; RLS bu alanlara göre
 * kiracıyı / şubeyi ayırdığı için her restoran ve şube kendi kasasını görür.
 *
 * Bu fonksiyon best-effort’tur; başarısızlığı kullanıcı akışını bozmaz.
 */
export async function ensureCashRegisterRowForPayment(input: {
  tenantId: string;
  branchId: string | null;
  paymentId: string;
  paymentMethod: 'cash' | 'credit_card' | 'open_account' | string;
  amount: number;
  createdBy: string | null;
  /** Tablo / hızlı satış / paket etiketi (DB tetikleyicisindeki ile aynı mantık). */
  tableLabel?: string | null;
  orderNumber?: string | null;
}): Promise<void> {
  if (!input.tenantId || !input.paymentId) return;

  try {
    const { count, error: checkErr } = await (supabase as any)
      .from('cash_register_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('reference_id', input.paymentId)
      .eq('reference_type', 'payment_transaction');

    if (checkErr) {
      console.warn('[cash-register fallback] count check failed:', checkErr.message);
      return;
    }
    if ((count || 0) > 0) {
      return;
    }

    const description =
      input.paymentMethod === 'cash'
        ? 'Nakit Ödeme'
        : input.paymentMethod === 'credit_card'
          ? 'Kredi Kartı Ödemesi'
          : input.paymentMethod === 'open_account'
            ? 'Açık Hesap Ödemesi'
            : 'Ödeme';

    const { error: insErr } = await (supabase as any)
      .from('cash_register_transactions')
      .insert({
        tenant_id: input.tenantId,
        branch_id: input.branchId,
        transaction_type: 'order_payment',
        payment_method: input.paymentMethod,
        amount: input.amount,
        reference_id: input.paymentId,
        reference_type: 'payment_transaction',
        description,
        order_number: input.orderNumber ?? null,
        table_name: input.tableLabel ?? null,
        created_by: input.createdBy,
      });

    if (insErr) {
      const msg = String(insErr.message || '');
      if (/duplicate|unique/i.test(msg)) return;
      console.warn('[cash-register fallback] insert failed:', msg);
    }
  } catch (e: any) {
    console.warn('[cash-register fallback] unexpected:', e?.message || String(e));
  }
}
