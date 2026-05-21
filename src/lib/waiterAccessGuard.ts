import { supabase } from './supabase';
import { getDeviceBindingCode } from './deviceBinding';
import { checkRestaurantIpGate } from './waiterRestaurantIpGate';

export type WaiterAccessResult =
  | { allowed: true; waiterId: string }
  | { allowed: false; title: string; message: string };

/**
 * Garson erişim denetimi: hesap aktif, cihaz bağlı, restoran ağı (IP /24).
 */
export async function verifyWaiterAccess(
  waiterId: string,
  tenantId: string,
): Promise<WaiterAccessResult> {
  const deviceCode = getDeviceBindingCode();

  const [waiterRes, bindingRes, acceptedReqRes] = await Promise.all([
    supabase.from('waiters').select('id, status').eq('id', waiterId).maybeSingle(),
    supabase
      .from('device_bindings')
      .select('id, status, allowed_ip_prefix')
      .eq('device_id', deviceCode)
      .eq('waiter_id', waiterId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('device_binding_requests')
      .select('device_info')
      .eq('waiter_id', waiterId)
      .eq('device_id', deviceCode)
      .eq('status', 'accepted')
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const waiter = waiterRes.data as { id?: string; status?: string } | null;
  if (waiterRes.error || !waiter?.id) {
    return {
      allowed: false,
      title: 'Hesap silindi',
      message: 'Garson hesabınız sistemden kaldırıldı. Yöneticinizle görüşün.',
    };
  }
  if (String(waiter.status || '').toLowerCase() !== 'active') {
    return {
      allowed: false,
      title: 'Hesap pasif',
      message: 'Garson hesabınız pasif duruma alındı. Erişim sonlandırıldı.',
    };
  }

  const binding = bindingRes.data as { id?: string; status?: string; allowed_ip_prefix?: string } | null;
  if (!binding?.id) {
    return {
      allowed: false,
      title: 'Cihaz bağlama kaldırıldı',
      message: 'Bu cihazın bağlama kaydı bulunamadı. Yeniden bağlama isteği gönderin.',
    };
  }
  if (String(binding.status || '').toLowerCase() !== 'active') {
    return {
      allowed: false,
      title: 'Cihaz erişimi kapalı',
      message: 'Bu cihazın erişimi yönetici tarafından durduruldu.',
    };
  }

  const gate = await checkRestaurantIpGate(
    binding.allowed_ip_prefix,
    (acceptedReqRes.data as { device_info?: Record<string, unknown> } | null)?.device_info,
  );
  if (!gate.ok) {
    return {
      allowed: false,
      title: 'Yetkisiz ağ',
      message: gate.message,
    };
  }

  return { allowed: true, waiterId: waiter.id };
}

/** Auth kullanıcı id → waiters satırı → erişim denetimi */
export async function verifyWaiterAccessByAuthUser(
  authUserId: string,
  tenantId: string,
): Promise<WaiterAccessResult> {
  const { data: waiter, error } = await supabase
    .from('waiters')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
    .maybeSingle();

  if (error || !waiter?.id) {
    return {
      allowed: false,
      title: 'Garson kaydı yok',
      message: 'Garson hesabınız bulunamadı. Yöneticinizle görüşün.',
    };
  }
  return verifyWaiterAccess(waiter.id, tenantId);
}

export function persistWaiterLogoutReason(title: string, message: string) {
  try {
    localStorage.setItem(
      'waiter_logout_reason',
      JSON.stringify({ title, message, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearWaiterLocalSession() {
  try {
    localStorage.removeItem('waiter_session');
  } catch {
    /* ignore */
  }
}
