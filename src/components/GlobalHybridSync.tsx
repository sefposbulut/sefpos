import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  flushHybridSyncOnReconnect,
  isHybridCloudLinked,
  isHybridMode,
  requestHybridSync,
} from '../lib/hybridMode';
import { getActivePosPage, PAGE_CHANGE_EVENT } from '../lib/pageActivity';
import { getCloudSupabaseClient } from '../lib/supabase';

/** Yedek periyodik senkron (realtime kacirirsa). Kasa kasmasin diye seyrek. */
const BACKUP_SYNC_MS = 45_000;

const LIVE_SYNC_PAGES = new Set([
  'tables',
  'takeaway',
  'quick-sale',
  'online-orders',
  'desktop-home',
]);

function shouldRunHybridBackup(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return LIVE_SYNC_PAGES.has(getActivePosPage());
}

/** Hibrit mod: bulut ↔ SQL senkron (online iken, POS ekranlarinda). */
export function GlobalHybridSync() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cloudRef = useRef<ReturnType<typeof getCloudSupabaseClient> | null>(null);
  const lastBackupAtRef = useRef(0);

  useEffect(() => {
    if (!isHybridMode() || !isHybridCloudLinked()) return;
    const api = (window as any).electronAPI;
    if (!api?.hybridSyncNow) return;

    let cancelled = false;

    const onRealtime = () => requestHybridSync(1_200);

    const startCloudRealtime = async () => {
      if (!api.getHybridCloudSession) return;
      const sess = await api.getHybridCloudSession();
      if (cancelled || !sess?.success || !sess.accessToken || !sess.cloudTenantId) return;

      const cloud = getCloudSupabaseClient();
      cloudRef.current = cloud;
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
          onRealtime,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_items', filter: `tenant_id=eq.${tenantId}` },
          onRealtime,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `tenant_id=eq.${tenantId}` },
          onRealtime,
        )
        .subscribe();

      channelRef.current = ch;
    };

    void startCloudRealtime();

    const runBackup = () => {
      if (!shouldRunHybridBackup()) return;
      const now = Date.now();
      if (now - lastBackupAtRef.current < BACKUP_SYNC_MS - 5_000) return;
      lastBackupAtRef.current = now;
      if (navigator.onLine) requestHybridSync(0);
    };

    requestHybridSync(400);
    timerRef.current = setInterval(runBackup, BACKUP_SYNC_MS);

    const onOnline = () => flushHybridSyncOnReconnect();
    const onPage = () => runBackup();
    const onVis = () => {
      if (document.visibilityState === 'visible') runBackup();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener(PAGE_CHANGE_EVENT, onPage);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(PAGE_CHANGE_EVENT, onPage);
      document.removeEventListener('visibilitychange', onVis);
      const cloud = cloudRef.current;
      if (channelRef.current && cloud) {
        void cloud.removeChannel(channelRef.current);
      }
      channelRef.current = null;
      cloudRef.current = null;
    };
  }, []);

  return null;
}
