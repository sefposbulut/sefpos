import { useEffect, useRef } from 'react';
import { isHybridCloudLinked, isHybridMode } from '../lib/hybridMode';

const SYNC_MS = 60_000;

/** Hibrit mod: bulut ↔ SQL sipariş senkronu (online iken). */
export function GlobalHybridSync() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isHybridMode() || !isHybridCloudLinked()) return;
    const api = (window as any).electronAPI;
    if (!api?.hybridSyncNow) return;

    const tick = () => {
      if (!navigator.onLine) return;
      void api
        .hybridSyncNow()
        .then((res: { success?: boolean }) => {
          if (res?.success) {
            window.dispatchEvent(new CustomEvent('sefpos:tables-changed'));
          }
        })
        .catch(() => {});
    };

    tick();
    timerRef.current = setInterval(tick, SYNC_MS);
    const onOnline = () => tick();
    window.addEventListener('online', onOnline);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
