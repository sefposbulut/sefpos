/**
 * Tek paylaşımlı 30 sn tick. POS gridindeki sürelerin yenilenmesi için
 * her hücre kendi setInterval'ını çalıştırırsa 50 masada 50 zamanlayıcı
 * olur. Bu modül tek bir interval ile tüm aboneleri tek seferde tetikler.
 */

import { recordPollerTick, registerPoller, unregisterPoller } from './resourceDiagnostics';

type Listener = (now: number) => void;

const TICK_MS = 60_000;
const listeners = new Set<Listener>();
let timerHandle: ReturnType<typeof setInterval> | null = null;
let visibilityHooked = false;

function fireTick() {
  const t = Date.now();
  for (const fn of listeners) {
    try { fn(t); } catch { /* abone hatası diğerlerini bozmasın */ }
  }
}

function start() {
  if (timerHandle != null) return;
  registerPoller('table-live-tick', TICK_MS);
  timerHandle = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    recordPollerTick('table-live-tick');
    fireTick();
  }, TICK_MS);

  if (!visibilityHooked && typeof document !== 'undefined') {
    visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fireTick();
    });
  }
}

function stop() {
  if (timerHandle != null) {
    clearInterval(timerHandle);
    timerHandle = null;
    unregisterPoller('table-live-tick');
  }
}

export function subscribeLiveTick(fn: Listener): () => void {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) stop();
  };
}
