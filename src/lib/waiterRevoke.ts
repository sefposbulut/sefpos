import { invokeEdgeFunction } from './supabase';

/** Garson pasif edildiğinde tüm cihazlardaki Supabase oturumlarını kapatır. */
export async function revokeWaiterAuthSessions(authUserId: string): Promise<void> {
  if (!authUserId) return;
  try {
    await invokeEdgeFunction('update-user', {
      target_user_id: authUserId,
      revoke_sessions: true,
    });
  } catch (e) {
    console.warn('[waiterRevoke] revoke_sessions:', e);
  }
}
