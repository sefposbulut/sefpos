import { supabase } from './supabase';

export type SupportNotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean | null;
  created_at: string;
  tenant_id: string | null;
};

export function dismissedNotifKey(tenantId: string): string {
  return `notif_dismissed_${tenantId}`;
}

export function getDismissedIds(tenantId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(dismissedNotifKey(tenantId)) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function persistDismissedIds(tenantId: string, dismissed: Set<string>): void {
  localStorage.setItem(
    dismissedNotifKey(tenantId),
    JSON.stringify(Array.from(dismissed).slice(-500)),
  );
}

/** Genel yayınlar localStorage ile gizlenmiş kayıtları listeden çıkarır. */
export function filterVisibleNotifications(
  rows: SupportNotificationRow[],
  tenantId: string,
): SupportNotificationRow[] {
  const dismissed = getDismissedIds(tenantId);
  return rows.filter((n) => !(n.tenant_id === null && dismissed.has(n.id)));
}

/** Okunmamis: kiraciya ozel satirda is_read=false; genel yayinda dismissed degil. */
export function isNotificationUnread(
  n: SupportNotificationRow,
  tenantId: string,
  dismissed?: Set<string>,
): boolean {
  if (n.type === 'revoke') return false;
  const dismissedSet = dismissed ?? getDismissedIds(tenantId);
  if (dismissedSet.has(n.id)) return false;
  if (n.tenant_id === tenantId) return !n.is_read;
  if (n.tenant_id === null) return true;
  return false;
}

export function countUnreadNotifications(
  notifications: SupportNotificationRow[],
  tenantId: string,
): number {
  const dismissed = getDismissedIds(tenantId);
  return notifications.filter((n) => isNotificationUnread(n, tenantId, dismissed)).length;
}

export async function fetchSupportNotifications(
  tenantId: string,
  limit = 50,
): Promise<SupportNotificationRow[]> {
  const { data, error } = await supabase
    .from('support_notifications')
    .select('id, title, message, type, is_read, created_at, tenant_id')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .neq('type', 'revoke')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[supportNotifications] fetch failed:', error.message);
    return [];
  }
  return filterVisibleNotifications((data || []) as SupportNotificationRow[], tenantId);
}

/** Tek bildirimi restoran listesinden kaldırır. */
export async function dismissSupportNotification(
  notif: SupportNotificationRow,
  tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (notif.tenant_id === tenantId) {
    const { error } = await supabase.from('support_notifications').delete().eq('id', notif.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  if (notif.tenant_id === null) {
    const dismissed = getDismissedIds(tenantId);
    dismissed.add(notif.id);
    persistDismissedIds(tenantId, dismissed);
    return { ok: true };
  }
  return { ok: false, error: 'Bu bildirim kaldırılamadı' };
}

/** Tüm görünen sistem bildirimlerini restoran listesinden temizler. */
export async function clearAllSupportNotifications(
  notifications: SupportNotificationRow[],
  tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  const tenantOwnedIds = notifications
    .filter((n) => n.tenant_id === tenantId)
    .map((n) => n.id);

  if (tenantOwnedIds.length > 0) {
    const { error } = await supabase
      .from('support_notifications')
      .delete()
      .in('id', tenantOwnedIds);
    if (error) return { ok: false, error: error.message };
  }

  const dismissed = getDismissedIds(tenantId);
  let changed = false;
  for (const n of notifications) {
    if (n.tenant_id === null && !dismissed.has(n.id)) {
      dismissed.add(n.id);
      changed = true;
    }
  }
  if (changed) persistDismissedIds(tenantId, dismissed);
  return { ok: true };
}

/** Panel acildiginda veya kullanici okudugunda. */
export async function markSupportNotificationsRead(
  notifications: SupportNotificationRow[],
  tenantId: string,
): Promise<void> {
  const dismissed = getDismissedIds(tenantId);
  const tenantIds = notifications
    .filter((n) => n.tenant_id === tenantId && !n.is_read)
    .map((n) => n.id);

  if (tenantIds.length > 0) {
    const { error } = await supabase
      .from('support_notifications')
      .update({ is_read: true })
      .in('id', tenantIds);
    if (error) console.warn('[supportNotifications] mark read failed:', error.message);
  }

  let changed = false;
  for (const n of notifications) {
    if (n.tenant_id === null && !dismissed.has(n.id)) {
      dismissed.add(n.id);
      changed = true;
    }
  }
  if (changed) persistDismissedIds(tenantId, dismissed);
}

const NOTIF_TYPE_LABELS: Record<string, string> = {
  info: 'Bilgi',
  success: 'Başarılı',
  warning: 'Uyarı',
  error: 'Önemli',
  wipe_local: 'Yerel temizleme',
};

/** Gelen bildirimi işle; wipe_local ise true döner (toast gösterme). */
export async function dispatchIncomingSupportNotification(n: {
  id: string;
  type?: string;
  tenant_id?: string | null;
}): Promise<boolean> {
  if (n.type !== 'wipe_local') return false;
  const { processWipeLocalNotification, shouldAutoProcessWipeLocal } = await import('./remoteWipe');
  if (shouldAutoProcessWipeLocal(n, 'realtime')) {
    void processWipeLocalNotification(n);
  }
  return true;
}

export function notificationTypeLabel(type: string): string {
  return NOTIF_TYPE_LABELS[type] || 'Bildirim';
}
