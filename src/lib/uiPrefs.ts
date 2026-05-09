import { useEffect, useState } from 'react';

/**
 * Arayüz tercihleri (POS optimizasyonlari):
 *  - headerHidden : ust menu gizli mi? (Tam Ekran POS modu)
 *  - uiScale      : icerik buyutme/kucultme orani (0.7..1.3)
 *
 * localStorage'a yazilir, oturumlar arasi kalici. Tum bilesenler arasinda
 * senkronizasyon icin storage olayina ek olarak custom event yayilir.
 */

const KEY_HEADER_HIDDEN = 'sefpos_ui_header_hidden';
const KEY_UI_SCALE = 'sefpos_ui_scale';

export const UI_SCALE_MIN = 0.7;
export const UI_SCALE_MAX = 1.3;
export const UI_SCALE_STEP = 0.05;

export interface UiPrefs {
  headerHidden: boolean;
  uiScale: number;
}

const EVENT_NAME = 'sefpos-ui-prefs-changed';

function clampScale(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 1;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(n * 100) / 100));
}

export function loadUiPrefs(): UiPrefs {
  try {
    const hidden = localStorage.getItem(KEY_HEADER_HIDDEN) === '1';
    const rawScale = localStorage.getItem(KEY_UI_SCALE);
    const scale = rawScale ? clampScale(parseFloat(rawScale)) : 1;
    return { headerHidden: hidden, uiScale: scale };
  } catch {
    return { headerHidden: false, uiScale: 1 };
  }
}

function emit(prefs: UiPrefs) {
  try {
    window.dispatchEvent(new CustomEvent<UiPrefs>(EVENT_NAME, { detail: prefs }));
  } catch {
    /* ignore */
  }
}

export function setHeaderHidden(hidden: boolean) {
  try {
    localStorage.setItem(KEY_HEADER_HIDDEN, hidden ? '1' : '0');
  } catch {
    /* ignore */
  }
  emit(loadUiPrefs());
}

export function setUiScale(scale: number) {
  const next = clampScale(scale);
  try {
    localStorage.setItem(KEY_UI_SCALE, String(next));
  } catch {
    /* ignore */
  }
  emit(loadUiPrefs());
}

export function bumpUiScale(delta: number) {
  const cur = loadUiPrefs().uiScale;
  setUiScale(cur + delta);
}

export function resetUiScale() {
  setUiScale(1);
}

/** React hook — herhangi bir bilesenden tercihleri reaktif olarak okur. */
export function useUiPrefs(): UiPrefs {
  const [prefs, setPrefs] = useState<UiPrefs>(() => loadUiPrefs());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UiPrefs>).detail;
      setPrefs(detail || loadUiPrefs());
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === KEY_HEADER_HIDDEN || e.key === KEY_UI_SCALE) {
        setPrefs(loadUiPrefs());
      }
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler as EventListener);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  return prefs;
}
