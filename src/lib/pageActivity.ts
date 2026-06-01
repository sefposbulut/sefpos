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

/** Paket / masa / hızlı satış — yoğun UI; Getir ve yan poll'lar seyreltilir. */
export function isHeavyPosScreen(): boolean {
  return activePage === 'takeaway' || activePage === 'tables' || activePage === 'quick-sale';
}

/** Getir sipariş poll'unun sık olması mantıklı ekranlar */
export function wantsFrequentGetirSync(): boolean {
  return (
    activePage === 'online-orders' ||
    activePage === 'tables' ||
    activePage === 'desktop-home'
  );
}
