import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  flushHybridSyncOnReconnect,
  isHybridCloudLinked,
  isHybridMode,
  requestHybridSync,
} from '../lib/hybridMode';
import { getCloudSupabaseClient } from '../lib/supabase';

/** Yedek periyodik senkron (realtime kacirirsa). */
const BACKUP_SYNC_MS = 2_000;

/** Hibrit mod: bulut ↔ SQL anlik senkron (online iken). */
export function GlobalHybridSync() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isHybridMode() || !isHybridCloudLinked()) return;
    const api = (window as any).electronAPI;
    if (!api?.hybridSyncNow) return;

    let cancelled = false;

    const startCloudRealtime = async () => {
      if (!api.getHybridCloudSession) return;
      const sess = await api.getHybridCloudSession();
      if (cancelled || !sess?.success || !sess.accessToken || !sess.cloudTenantId) return;

      const cloud = getCloudSupabaseClient();
      await cloud.auth.setSession({
        access_token: sess.accessToken,
        refresh_token: sess.refreshToken || '',
      });

      const tenantId = sess.cloudTenantId;

      const ch = cloud
        .channel(`hybrid-live-${tenantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
          () => requestHybridSync(0),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_items', filter: `tenant_id=eq.${tenantId}` },
          () => requestHybridSync(0),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `tenant_id=eq.${tenantId}` },
          () => requestHybridSync(0),
        )
        .subscribe();

      channelRef.current = ch;
    };

    void startCloudRealtime();

    requestHybridSync(0);
    timerRef.current = setInterval(() => {
      if (navigator.onLine) requestHybridSync(0);
    }, BACKUP_SYNC_MS);

    const onOnline = () => flushHybridSyncOnReconnect();
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('online', onOnline);
      void channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  return null;
}
