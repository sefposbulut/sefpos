import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  callGetir,
  syncGetirStoreStatusFromApi,
  isGetirRateLimited,
} from '../lib/getirApi';
import { isPageVisible, startAdaptivePoller } from '../lib/pollSchedule';
import { isSqlServerMode } from '../lib/sqlDb';
import { wantsFrequentGetirSync } from '../lib/pageActivity';

export const GETIR_STORE_STATUS_EVENT = 'sefpos:getir-store-status';
export const GETIR_ORDERS_POLLED_EVENT = 'sefpos:getir-orders-polled';

/** Online / masa / ana sayfa: sık. Paket vb. yoğun ekran: seyrek (sayfa değişince run içinde okunur). */
const ORDER_BASE_FAST_MS = 40_000;
const ORDER_BASE_SLOW_MS = 120_000;
const ORDER_IDLE_MS = 90_000;
const STORE_BASE_FAST_MS = 90_000;
const STORE_BASE_SLOW_MS = 240_000;
const STORE_IDLE_MS = 300_000;

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
    if (!tenant?.id || isSqlServerMode()) return;

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
      if (!wantsFrequentGetirSync()) return;
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
      if (!wantsFrequentGetirSync()) return;
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

    const orderPollOpts = () => ({
      diagLabel: 'getir-orders-poll',
      baseMs: wantsFrequentGetirSync() ? ORDER_BASE_FAST_MS : ORDER_BASE_SLOW_MS,
      idleMs: ORDER_IDLE_MS,
      hiddenMs: 0 as const,
      run: pollOrders,
      immediate: false as const,
    });
    const storePollOpts = () => ({
      diagLabel: 'getir-store-poll',
      baseMs: wantsFrequentGetirSync() ? STORE_BASE_FAST_MS : STORE_BASE_SLOW_MS,
      idleMs: STORE_IDLE_MS,
      hiddenMs: 0 as const,
      run: syncStore,
      immediate: false as const,
    });

    let stopOrders = startAdaptivePoller(orderPollOpts());
    let stopStore = startAdaptivePoller(storePollOpts());

    const restartPollersForPage = () => {
      stopOrders();
      stopStore();
      stopOrders = startAdaptivePoller(orderPollOpts());
      stopStore = startAdaptivePoller(storePollOpts());
    };

    const onPageChange = () => restartPollersForPage();
    window.addEventListener('sefpos:page-change', onPageChange);

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
      window.removeEventListener('sefpos:page-change', onPageChange);
      document.removeEventListener('visibilitychange', onVisible);
      platformIdRef.current = null;
      orderTickRef.current = 0;
    };
  }, [tenant?.id]);

  return null;
}
