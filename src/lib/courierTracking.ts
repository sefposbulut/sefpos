import { supabase } from './supabase';

/** Kurye GPS — anlık harita + mümkün olan en iyi arka plan davranışı (PWA). */
const GEO_ACTIVE: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 0,
};

const GEO_BG: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 2_000,
};

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export type CourierTrackingCallbacks = {
  onStatus: (status: 'tracking' | 'denied' | 'idle') => void;
  getActiveOrderId: () => string | null;
  /** Aktif teslimat varken ekran kilidi gecikmesini azaltır */
  hasActiveDelivery: () => boolean;
};

export function startCourierTracking(
  courierId: string,
  tenantId: string,
  callbacks: CourierTrackingCallbacks,
): () => void {
  if (!navigator.geolocation) {
    callbacks.onStatus('denied');
    return () => {};
  }

  let watchId: number | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let lastCourierPush = 0;
  let lastHistoryPush = 0;
  let lastPos: { lat: number; lng: number } | null = null;
  let inFlight = false;

  const acquireWakeLock = async () => {
    if (!callbacks.hasActiveDelivery()) return;
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch {
      /* izin / düşük pil */
    }
  };

  const releaseWakeLock = async () => {
    try {
      await wakeLock?.release();
    } catch {
      /* noop */
    }
    wakeLock = null;
  };

  const pushOnce = async (lat: number, lng: number, force = false) => {
    const now = Date.now();
    const moved = lastPos ? haversineM(lastPos, { lat, lng }) : 999;
    const courierDue = force || now - lastCourierPush >= 2_500 || moved >= 4;
    const historyDue = force || now - lastHistoryPush >= 12_000 || moved >= 25;

    if (!courierDue && !historyDue) return;
    if (inFlight) return;
    inFlight = true;

    try {
      callbacks.onStatus('tracking');
      const ts = new Date().toISOString();

      if (courierDue) {
        await supabase.from('couriers').update({
          latitude: lat,
          longitude: lng,
          location_updated_at: ts,
        }).eq('id', courierId);
        lastCourierPush = now;
      }

      if (historyDue) {
        const orderId = callbacks.getActiveOrderId();
        const { error: histErr } = await supabase.from('courier_location_history').insert({
          tenant_id: tenantId,
          courier_id: courierId,
          order_id: orderId,
          latitude: lat,
          longitude: lng,
        });
        if (histErr && !/does not exist|schema cache/i.test(histErr.message)) {
          console.warn('[courierTracking] history:', histErr.message);
        }
        lastHistoryPush = now;
      }

      lastPos = { lat, lng };
    } finally {
      inFlight = false;
    }
  };

  const readPosition = (force = false) => {
    const opts = document.visibilityState === 'visible' ? GEO_ACTIVE : GEO_BG;
    navigator.geolocation.getCurrentPosition(
      (pos) => { void pushOnce(pos.coords.latitude, pos.coords.longitude, force); },
      () => { callbacks.onStatus('denied'); },
      opts,
    );
  };

  const startWatch = () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
      (pos) => { void pushOnce(pos.coords.latitude, pos.coords.longitude); },
      () => { callbacks.onStatus('denied'); },
      GEO_ACTIVE,
    );
  };

  const tickMs = () => (document.visibilityState === 'visible' ? 6_000 : 10_000);

  const rescheduleTick = () => {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => readPosition(true), tickMs());
  };

  readPosition(true);
  startWatch();
  rescheduleTick();
  void acquireWakeLock();

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      readPosition(true);
      startWatch();
      void acquireWakeLock();
    } else {
      readPosition(true);
      void releaseWakeLock();
    }
    rescheduleTick();
  };

  const onPageShow = () => {
    readPosition(true);
    void acquireWakeLock();
  };

  const onPageHide = () => {
    readPosition(true);
  };

  const onWakeLockVisible = () => {
    if (document.visibilityState === 'visible') void acquireWakeLock();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onWakeLockVisible);

  const wakeInterval = setInterval(() => {
    if (callbacks.hasActiveDelivery()) void acquireWakeLock();
    else void releaseWakeLock();
  }, 30_000);

  return () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    if (tickTimer) clearInterval(tickTimer);
    clearInterval(wakeInterval);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onWakeLockVisible);
    void releaseWakeLock();
  };
}

/** Kurye PWA — iOS ana ekran + tam ekran */
export function applyCourierPwaMeta(): void {
  const setMeta = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      el.name = name;
      document.head.appendChild(el);
    }
    el.content = content;
  };
  setMeta('apple-mobile-web-app-capable', 'yes');
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  setMeta('mobile-web-app-capable', 'yes');
}
