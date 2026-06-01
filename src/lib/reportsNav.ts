/** Electron ana menü → Raporlar sekmesi (sessionStorage, tek kullanımlık). */
export const REPORTS_INITIAL_TAB_STORAGE_KEY = 'sefpos_reports_initial_tab';

/** Raporlar içi sayım geçmişi sekmesi */
export const REPORTS_TAB_STOCK_COUNT = 'stock-count';

/** Electron menüde hangi rapor kartının vurgulanacağı: `sales` | `genel`. */
export const REPORTS_MENU_LAST_KEY = 'sefpos_reports_menu_last';

/** Eski `reports-stock-count` sayfası → Raporlar / Sayım sekmesi */
export function primeReportsStockCountTab(): void {
  try {
    sessionStorage.setItem(REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_TAB_STOCK_COUNT);
  } catch {
    /* ignore */
  }
}
