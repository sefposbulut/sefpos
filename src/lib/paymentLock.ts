import { supabase } from './supabase';

export const PAYMENT_LOCK_TTL_MS = 4 * 60 * 1000;

export function getPaymentLockTabSession(): string {
  try {
    const k = 'sefpos.payment-lock-tab';
    let s = sessionStorage.getItem(k);
    if (!s) {
      s = crypto.randomUUID();
      sessionStorage.setItem(k, s);
    }
    return s;
  } catch {
    return `fallback-${Date.now()}`;
  }
}

export const PAYMENT_LOCK_CLEAR_FIELDS = {
  payment_locked: false,
  payment_locked_at: null as string | null,
  payment_locked_by_session: null as string | null,
  payment_lock_expires_at: null as string | null,
};

export function canManualUnlockPaymentLock(role: string | null | undefined): boolean {
  return !!role && ['owner', 'admin', 'manager', 'super_admin'].includes(role);
}

export async function clearTablePaymentLock(tableId: string): Promise<void> {
  await supabase.from('restaurant_tables').update(PAYMENT_LOCK_CLEAR_FIELDS).eq('id', tableId);
}

/** Bu sekmenin bıraktığı kilidi temizle (yenileme / çökme sonrası). */
export async function clearOwnSessionPaymentLock(tableId: string): Promise<void> {
  const session = getPaymentLockTabSession();
  await supabase
    .from('restaurant_tables')
    .update(PAYMENT_LOCK_CLEAR_FIELDS)
    .eq('id', tableId)
    .eq('payment_locked_by_session', session);
}

export async function unlockStalePaymentLocksRpc(): Promise<void> {
  try {
    await supabase.rpc('unlock_stale_payment_locks');
  } catch {
    /* RPC yoksa istemci tarafı kilidi açmaya devam eder */
  }
}

export async function manualUnlockTablePayment(
  tableId: string,
  reason = 'Admin override',
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('unlock_table_payment', {
    p_table_id: tableId,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as { success?: boolean; error?: string } | null;
  if (row?.success) {
    return { ok: true };
  }
  return { ok: false, error: row?.error || 'Bilinmeyen hata' };
}
