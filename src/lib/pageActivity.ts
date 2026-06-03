/**
 * Hangi POS sayfasının açık olduğu — arka plan poll/realtime'i buna göre kıs veya durdur.
 * App.tsx her geçişte setActivePosPage çağırır.
 */

export const PAGE_CHANGE_EVENT = 'sefpos:page-change';

let activePage = 'tables';

export function setActivePosPage(page: string): void {
  if (activePage === page) return;
  activePage = page;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PAGE_CHANGE_EVENT, { detail: page }));
  }
}

export function getActivePosPage(): string {
  return activePage;
}

export function isActivePosPage(...pages: string[]): boolean {
  return pages.includes(activePage);
}

/** Paket / masa / hızlı satış — yoğun UI; gereksiz arka plan poll'ları kes. */
export function isHeavyPosScreen(): boolean {
  return activePage === 'takeaway' || activePage === 'tables' || activePage === 'quick-sale';
}

/**
 * Getir API poll hızı — ana ekranda seyrek, online ekranda sık.
 * `off`: poll yok (paket, stok, ayar vb. — Realtime toast yeter).
 */
export type GetirPollTier = 'off' | 'slow' | 'moderate' | 'fast';

export function getGetirPollTier(): GetirPollTier {
  switch (activePage) {
    case 'online-orders':
      return 'fast';
    case 'tables':
      return 'moderate';
    case 'desktop-home':
      return 'slow';
    default:
      return 'off';
  }
}

/** @deprecated getGetirPollTier() kullanın — geriye dönük */
export function wantsFrequentGetirSync(): boolean {
  return getGetirPollTier() === 'fast';
}

/** Getir poll sonrası yedek DB taraması (toast) — yalnızca sipariş/masa ekranı */
export function wantsOnlineOrderToastPoll(): boolean {
  return activePage === 'online-orders' || activePage === 'tables';
}
