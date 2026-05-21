import { supabase } from './supabase';

/** Kurye uygulamasına yeni atama bildirimi (realtime + ses). */
export async function sendCourierAssignmentNotification(
  tenantId: string,
  courierId: string,
  orderId: string,
  orderNumber: string,
  address: string | null,
): Promise<void> {
  const { error } = await supabase.from('courier_notifications').insert({
    tenant_id: tenantId,
    courier_id: courierId,
    order_id: orderId,
    title: 'Yeni Paket',
    message: `${orderNumber} numaralı sipariş size atandı.${address ? ` Adres: ${address}` : ''}`,
    type: 'order_assigned',
    is_read: false,
  });
  if (error) console.warn('[courierNotification] insert failed:', error.message);
}
