import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isSqlServerMode } from '../lib/sqlDb';
import {
  callGetir,
  syncGetirStoreStatusFromApi,
  isGetirRateLimited,
} from '../lib/getirApi';

export const GETIR_STORE_STATUS_EVENT = 'sefpos:getir-store-status';
export const GETIR_ORDERS_POLLED_EVENT = 'sefpos:getir-orders-polled';

/** Tek merkez: masalar ekranindayken de Getir; OnlineOrders ile cift poll yapilmaz. */
const ORDER_TICK_MS = 40_000;
const STORE_SYNC_MS = 90_000;

/**
 * Tüm POS ekranlarında arka planda Getir senkronu:
 * - Mağaza açık/kapalı (~90 sn)
 * - Onay bekleyen / aktif siparişler sırayla (~40 sn'de bir aksiyon)
 */
export function GlobalGetirSync() {
  const { tenant } = useAuth();
  const platformIdRef = useRef<string | null>(null);
  const orderTickRef = useRef(0);

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
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      const id = data?.id ?? null;
      platformIdRef.current = id;
      return id;
    };

    const syncStore = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (isGetirRateLimited()) return;
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
      if (isGetirRateLimited()) return;
      const platformId = await resolvePlatformId();
      if (!platformId) return;

      orderTickRef.current += 1;
      const action =
        orderTickRef.current % 2 === 1 ? 'poll-unapproved' : 'poll-active';

      try {
        const res = await callGetir({ platformId, action });
        const dataObj =
          res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : {};
        const saved = Number(res.saved ?? dataObj.saved ?? 0);
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
        if (res.ok && (saved > 0 || newCount > 0)) {
          window.dispatchEvent(
            new CustomEvent(GETIR_ORDERS_POLLED_EVENT, {
              detail: { platformId, newCount, saved, action },
            }),
          );
        }
      } catch (e) {
        if (!isGetirRateLimited()) {
          console.warn(`[GlobalGetirSync] ${action}:`, e);
        }
      }
    };

    const kick = () => {
      if (document.visibilityState !== 'visible') return;
      void syncStore();
      void pollOrders();
    };

    const firstOrder = window.setTimeout(() => void pollOrders(), 2_500);
    const firstStore = window.setTimeout(() => void syncStore(), 1_000);

    const orderTimer = window.setInterval(() => void pollOrders(), ORDER_TICK_MS);
    const storeTimer = window.setInterval(() => void syncStore(), STORE_SYNC_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearTimeout(firstOrder);
      window.clearTimeout(firstStore);
      window.clearInterval(orderTimer);
      window.clearInterval(storeTimer);
      document.removeEventListener('visibilitychange', onVisible);
      platformIdRef.current = null;
      orderTickRef.current = 0;
    };
  }, [tenant?.id]);

  return null;
}
