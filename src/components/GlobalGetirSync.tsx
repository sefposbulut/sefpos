import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  callGetir,
  syncGetirStoreStatusFromApi,
  isGetirRateLimited,
} from '../lib/getirApi';
import { isPageVisible, startAdaptivePoller } from '../lib/pollSchedule';

export const GETIR_STORE_STATUS_EVENT = 'sefpos:getir-store-status';
export const GETIR_ORDERS_POLLED_EVENT = 'sefpos:getir-orders-polled';

/** Tek merkez: masalar ekranindayken de Getir; OnlineOrders ile cift poll yapilmaz. */
const ORDER_BASE_MS = 35_000;
const ORDER_IDLE_MS = 55_000;
const STORE_BASE_MS = 90_000;
const STORE_IDLE_MS = 180_000;

/**
 * Tüm POS ekranlarında arka planda Getir senkronu:
 * - Mağaza açık/kapalı
 * - Onay bekleyen / aktif siparişler sırayla
 * Gizli sekme: durur. 2 dk etkileşimsiz: aralık uzar (429 riski düşer, kasa hafifler).
 */
export function GlobalGetirSync() {
  const { tenant } = useAuth();
  const platformIdRef = useRef<string | null>(null);
  const orderTickRef = useRef(0);

  useEffect(() => {
    if (!tenant?.id) return;

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
      if (stopped || !isPageVisible()) return;
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
      if (stopped || !isPageVisible()) return;
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
      if (!isPageVisible()) return;
      void syncStore();
      void pollOrders();
    };

    const firstOrder = window.setTimeout(() => void pollOrders(), 2_500);
    const firstStore = window.setTimeout(() => void syncStore(), 1_000);

    const stopOrders = startAdaptivePoller({
      baseMs: ORDER_BASE_MS,
      idleMs: ORDER_IDLE_MS,
      hiddenMs: 0,
      run: pollOrders,
      immediate: false,
    });
    const stopStore = startAdaptivePoller({
      baseMs: STORE_BASE_MS,
      idleMs: STORE_IDLE_MS,
      hiddenMs: 0,
      run: syncStore,
      immediate: false,
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearTimeout(firstOrder);
      window.clearTimeout(firstStore);
      stopOrders();
      stopStore();
      document.removeEventListener('visibilitychange', onVisible);
      platformIdRef.current = null;
      orderTickRef.current = 0;
    };
  }, [tenant?.id]);

  return null;
}
