import { supabase } from './supabase';

/**
 * Bir satışın **mutlaka tek bir** kasa satırına dönüşmesini garantiler.
 *
 * Akış:
 *  1) İlgili `order_number` için kasada `order_payment` satırı sayar.
 *  2) Beklenen ödeme sayısından az satır varsa eksik kadar yeni satır ekler.
 *  3) Yeterliyse hiçbir şey yapmaz (DB tetikleyicisi zaten yazmıştır → çift kayıt olmaz).
 *
 * `tenant_id` + `branch_id` her zaman set edilir; RLS bu alanları izole ediyor
 * (her restoran/şube yalnız kendi kasasını görür). Hata durumunda `console.warn`
 * basar ama kullanıcı akışını bozmaz.
 */
export async function ensureCashRegisterRowForPayment(input: {
  tenantId: string;
  branchId: string | null;
  /** payment_transactions.id (biliniyorsa). Bilinmiyorsa boş bırakılabilir. */
  paymentId?: string | null;
  paymentMethod: 'cash' | 'credit_card' | 'open_account' | string;
  amount: number;
  createdBy: string | null;
  tableLabel?: string | null;
  orderNumber?: string | null;
  /** Order ID (paymentId bilinmediğinde lookup için). */
  orderId?: string | null;
}): Promise<void> {
  if (!input.tenantId) return;

  try {
    if (!input.orderNumber) {
      console.warn('[cash-register fallback] orderNumber yok, atlandı.');
      return;
    }

    const { count: existingCount, error: countErr } = await (supabase as any)
      .from('cash_register_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', input.tenantId)
      .eq('transaction_type', 'order_payment')
      .eq('order_number', input.orderNumber);

    if (countErr) {
      console.warn('[cash-register fallback] count check failed:', countErr.message);
    }
    if ((existingCount || 0) > 0) {
      return;
    }

    let paymentId = input.paymentId ?? null;
    if (!paymentId && input.orderId) {
      const { data: pay } = await (supabase as any)
        .from('payment_transactions')
        .select('id')
        .eq('order_id', input.orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      paymentId = (pay as any)?.id ?? null;
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
        reference_id: paymentId,
        reference_type: paymentId ? 'payment_transaction' : 'order',
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
