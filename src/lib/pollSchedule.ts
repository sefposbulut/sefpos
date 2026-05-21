/**
 * POS ölçek paketi: görünürlük + kullanıcı boşta → aralıkları uzat, gizli sekmede durdur.
 * 10k+ restoran × çok kasa senaryosunda gereksiz API yükünü keser.
 */

const DEFAULT_IDLE_AFTER_MS = 2 * 60 * 1000;

let lastActivityAt = Date.now();
let activityHooked = false;

function hookUserActivity() {
  if (activityHooked || typeof window === 'undefined') return;
  activityHooked = true;
  const touch = () => {
    lastActivityAt = Date.now();
  };
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  window.addEventListener('pointerdown', touch, opts);
  window.addEventListener('keydown', touch, opts);
  window.addEventListener('wheel', touch, opts);
  window.addEventListener('touchstart', touch, opts);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastActivityAt = Date.now();
  });
}

export function touchUserActivity(): void {
  lastActivityAt = Date.now();
}

export function getUserIdleMs(): number {
  hookUserActivity();
  return Math.max(0, Date.now() - lastActivityAt);
}

export function isUserIdle(idleAfterMs = DEFAULT_IDLE_AFTER_MS): boolean {
  return getUserIdleMs() >= idleAfterMs;
}

export function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export type AdaptiveIntervalOpts = {
  /** Sekme görünür + kullanıcı aktifken */
  baseMs: number;
  /** Kullanıcı 2+ dk etkileşimsiz (varsayılan eşik) */
  idleMs?: number;
  /** Sekme arka planda — 0 = poll yok */
  hiddenMs?: number;
  idleAfterMs?: number;
};

export function resolveAdaptiveIntervalMs(opts: AdaptiveIntervalOpts): number {
  hookUserActivity();
  const hiddenMs = opts.hiddenMs ?? 0;
  if (!isPageVisible()) return hiddenMs;
  const idleMs = opts.idleMs ?? opts.baseMs * 1.5;
  if (isUserIdle(opts.idleAfterMs ?? DEFAULT_IDLE_AFTER_MS)) return idleMs;
  return opts.baseMs;
}

export type AdaptivePollerOpts = AdaptiveIntervalOpts & {
  run: () => void | Promise<void>;
  /** true: mount’ta hemen bir tick (görünürse) */
  immediate?: boolean;
};

/**
 * setInterval yerine: her turda bir sonraki gecikmeyi hesaplar (gizli/boşta uzar).
 */
export function startAdaptivePoller(opts: AdaptivePollerOpts): () => void {
  hookUserActivity();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = () => {
    if (stopped) return;
    const delay = resolveAdaptiveIntervalMs(opts);
    if (delay <= 0) return;
    timer = window.setTimeout(() => {
      void tick();
    }, delay);
  };

  const tick = async () => {
    if (stopped) return;
    const delay = resolveAdaptiveIntervalMs(opts);
    if (delay <= 0) {
      return;
    }
    try {
      await opts.run();
    } catch {
      /* tek tur hatası sonrakini bozmasın */
    }
    scheduleNext();
  };

  const kick = () => {
    if (stopped || !isPageVisible()) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    void tick();
  };

  if (opts.immediate !== false && isPageVisible()) {
    void tick();
  } else {
    scheduleNext();
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
