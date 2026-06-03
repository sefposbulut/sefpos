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
import {
  getGetirPollTier,
  PAGE_CHANGE_EVENT,
  type GetirPollTier,
} from '../lib/pageActivity';

export const GETIR_STORE_STATUS_EVENT = 'sefpos:getir-store-status';
export const GETIR_ORDERS_POLLED_EVENT = 'sefpos:getir-orders-polled';

const ORDER_MS: Record<GetirPollTier, number> = {
  off: 0,
  slow: 180_000,
  moderate: 90_000,
  fast: 40_000,
};
const STORE_MS: Record<GetirPollTier, number> = {
  off: 0,
  slow: 300_000,
  moderate: 180_000,
  fast: 90_000,
};
const ORDER_IDLE_MS = 120_000;
const STORE_IDLE_MS = 300_000;

function tierIntervals(tier: GetirPollTier) {
  return {
    orderBase: ORDER_MS[tier],
    storeBase: STORE_MS[tier],
  };
}

/**
 * Getir senkronu — yalnızca aktif Getir entegrasyonu ve ilgili ekranda.
 * Ana ekran: seyrek; online sipariş: sık; paket/stok/ayar: kapalı (kasma kesilir).
 * Yeni sipariş bildirimi: Realtime + (gerekirse) toast yedek poll.
 */
export function GlobalGetirSync() {
  const { tenant } = useAuth();
  const platformIdRef = useRef<string | null>(null);
  const orderTickRef = useRef(0);
  const tierRef = useRef<GetirPollTier>(getGetirPollTier());

  useEffect(() => {
    if (!tenant?.id || isSqlServerMode()) return;

    let stopped = false;
    let stopOrders: (() => void) | null = null;
    let stopStore: (() => void) | null = null;
    let firstOrder: ReturnType<typeof setTimeout> | null = null;
    let firstStore: ReturnType<typeof setTimeout> | null = null;

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

    const shouldRun = (): boolean => {
      const tier = getGetirPollTier();
      tierRef.current = tier;
      return tier !== 'off' && isPageVisible();
    };

    const syncStore = async () => {
      if (stopped || !shouldRun()) return;
      if (isGetirRateLimited()) return;
      const platformId = await resolvePlatformId();
      if (!platformId || stopped) return;
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
      if (stopped || !shouldRun()) return;
      if (isGetirRateLimited()) return;
      const platformId = await resolvePlatformId();
      if (!platformId || stopped) return;

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

    const stopAllPollers = () => {
      stopOrders?.();
      stopStore?.();
      stopOrders = null;
      stopStore = null;
      if (firstOrder) window.clearTimeout(firstOrder);
      if (firstStore) window.clearTimeout(firstStore);
      firstOrder = null;
      firstStore = null;
    };

    const startPollersForTier = (tier: GetirPollTier) => {
      stopAllPollers();
      if (tier === 'off' || stopped) return;

      const { orderBase, storeBase } = tierIntervals(tier);
      if (orderBase <= 0 && storeBase <= 0) return;

      firstStore = window.setTimeout(() => void syncStore(), 1_500);
      firstOrder = window.setTimeout(() => void pollOrders(), 3_000);

      if (orderBase > 0) {
        stopOrders = startAdaptivePoller({
          diagLabel: 'getir-orders-poll',
          baseMs: orderBase,
          idleMs: ORDER_IDLE_MS,
          hiddenMs: 0,
          run: pollOrders,
          immediate: false,
        });
      }
      if (storeBase > 0) {
        stopStore = startAdaptivePoller({
          diagLabel: 'getir-store-poll',
          baseMs: storeBase,
          idleMs: STORE_IDLE_MS,
          hiddenMs: 0,
          run: syncStore,
          immediate: false,
        });
      }
    };

    const boot = async () => {
      const platformId = await resolvePlatformId();
      if (stopped || !platformId) return;
      startPollersForTier(getGetirPollTier());
    };

    void boot();

    const onPageChange = () => {
      startPollersForTier(getGetirPollTier());
    };
    window.addEventListener(PAGE_CHANGE_EVENT, onPageChange);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const tier = getGetirPollTier();
      if (tier === 'off') {
        stopAllPollers();
        return;
      }
      if (!stopOrders && !stopStore) {
        void resolvePlatformId().then((id) => {
          if (id && !stopped) startPollersForTier(tier);
        });
        return;
      }
      void syncStore();
      void pollOrders();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      stopAllPollers();
      window.removeEventListener(PAGE_CHANGE_EVENT, onPageChange);
      document.removeEventListener('visibilitychange', onVisible);
      platformIdRef.current = null;
      orderTickRef.current = 0;
    };
  }, [tenant?.id]);

  return null;
}
