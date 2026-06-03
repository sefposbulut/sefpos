/**
 * POS sayfa mount stratejisi:
 * - Sıcak yol (masa, paket, online): bir kez açılınca display:none ile saklanır — anında geçiş.
 * - Soğuk sayfalar (stok, rapor, gün sonu…): çıkınca unmount — gizli yük birikmez.
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

export function shouldRenderPosPage(
  page: string,
  currentPage: string,
  mounted: Set<string>,
): boolean {
  if (currentPage === page) return true;
  return WARM_POS_PAGES.has(page) && mounted.has(page);
}
