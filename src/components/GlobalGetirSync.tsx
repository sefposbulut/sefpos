import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isSqlServerMode } from '../lib/sqlDb';
import { callGetir, syncGetirStoreStatusFromApi } from '../lib/getirApi';

export const GETIR_STORE_STATUS_EVENT = 'sefpos:getir-store-status';
export const GETIR_ORDERS_POLLED_EVENT = 'sefpos:getir-orders-polled';

const STORE_SYNC_MS = 20_000;
const ORDER_POLL_MS = 15_000;

/**
 * Tüm POS ekranlarında arka planda Getir senkronu:
 * - Mağaza açık/kapalı (Getir panelinden kapatınca ~20 sn içinde UI güncellenir)
 * - Onay bekleyen siparişler (masalar ekranındayken de toast + DB)
 */
export function GlobalGetirSync() {
  const { tenant } = useAuth();
  const platformIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tenant?.id) return;
    if (isSqlServerMode()) return;

    let stopped = false;

    const resolvePlatformId = async (): Promise<string | null> => {
      if (platformIdRef.current) return platformIdRef.current;
      const { data } = await supabase
        .from('online_order_platforms')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('platform_code', 'getir')
        .limit(1)
        .maybeSingle();
      const id = data?.id ?? null;
      platformIdRef.current = id;
      return id;
    };

    const syncStore = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const platformId = await resolvePlatformId();
      if (!platformId) return;
      try {
        const sync = await syncGetirStoreStatusFromApi(platformId);
        if (stopped || !sync.ok) return;
        window.dispatchEvent(
          new CustomEvent(GETIR_STORE_STATUS_EVENT, {
            detail: {
              platformId,
              restaurantOpen: sync.restaurantOpen ?? null,
              posStatus: sync.posStatus ?? null,
            },
          }),
        );
      } catch (e) {
        console.warn('[GlobalGetirSync] store-status:', e);
      }
    };

    const pollOrders = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const platformId = await resolvePlatformId();
      if (!platformId) return;
      try {
        const res = await callGetir({ platformId, action: 'poll-unapproved' });
        const dataObj =
          res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : {};
        const newCount = Number(res.newCount ?? dataObj.newCount ?? 0);
        const storeClosed =
          (res as { storeClosed?: boolean }).storeClosed === true ||
          dataObj.storeClosed === true ||
          dataObj.restaurantOpen === false;
        if (storeClosed) {
          window.dispatchEvent(
            new CustomEvent(GETIR_STORE_STATUS_EVENT, {
              detail: { platformId, restaurantOpen: false, posStatus: null },
            }),
          );
        }
        if (res.ok && newCount > 0) {
          window.dispatchEvent(
            new CustomEvent(GETIR_ORDERS_POLLED_EVENT, {
              detail: { platformId, newCount, saved: Number(dataObj.saved ?? 0) },
            }),
          );
        }
      } catch (e) {
        console.warn('[GlobalGetirSync] poll-unapproved:', e);
      }
    };

    void syncStore();
    void pollOrders();

    const storeTimer = window.setInterval(syncStore, STORE_SYNC_MS);
    const orderTimer = window.setInterval(pollOrders, ORDER_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncStore();
        void pollOrders();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(storeTimer);
      window.clearInterval(orderTimer);
      document.removeEventListener('visibilitychange', onVisible);
      platformIdRef.current = null;
    };
  }, [tenant?.id]);

  return null;
}
