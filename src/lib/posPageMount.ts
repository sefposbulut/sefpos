/**
 * POS sayfa mount stratejisi:
 * - Sıcak yol (masa, paket, online): web'de display:none ile saklanır — anında geçiş.
 * - Electron: yalnızca aktif sıcak sayfa mount — gün boyu gizli poll/realtime birikmez.
 * - Soğuk sayfalar: çıkınca unmount.
 */
export const WARM_POS_PAGES = new Set([
  'tables',
  'takeaway',
  'online-orders',
]);

export function purgeColdMountedPages(mounted: Set<string>, activePage: string): void {
  for (const p of [...mounted]) {
    if (!WARM_POS_PAGES.has(p) && p !== activePage) {
      mounted.delete(p);
    }
  }
}

/** Electron: masa+ paket+ online aynı anda bellekte kalmasın. */
export function purgeElectronWarmPages(mounted: Set<string>, activePage: string): void {
  for (const p of [...mounted]) {
    if (WARM_POS_PAGES.has(p) && p !== activePage) {
      mounted.delete(p);
    }
  }
  if (activePage !== 'desktop-home' && mounted.has('desktop-home')) {
    mounted.delete('desktop-home');
  }
}

export function purgeMountedPagesForSession(
  mounted: Set<string>,
  activePage: string,
  opts?: { electron?: boolean },
): void {
  purgeColdMountedPages(mounted, activePage);
  if (opts?.electron) purgeElectronWarmPages(mounted, activePage);
}

export function shouldRenderPosPage(
  page: string,
  currentPage: string,
  mounted: Set<string>,
): boolean {
  if (currentPage === page) return true;
  return WARM_POS_PAGES.has(page) && mounted.has(page);
}
