import { isSqlServerMode } from './sqlDb';

/** Bulutta çalışır; SQL Server offline kurulumda devre dışı (hata yerine bilgi). */
export const SQL_ONLINE_ONLY_PAGES = new Set([
  'online-orders',
  'integrations',
  'partner-api',
  'platforms',
]);

export function isSqlOnlineOnlyPage(page: string): boolean {
  return isSqlServerMode() && SQL_ONLINE_ONLY_PAGES.has(page);
}

export function sqlOnlineOnlyPageMessage(page: string): string {
  if (page === 'online-orders') {
    return 'Online siparişler (Getir / Yemeksepeti) yalnızca bulut bağlantısında çalışır. SQL Server modunda masalar, kasa, ürünler ve raporlar kullanılabilir.';
  }
  return 'Bu bölüm internet ve bulut hesabı gerektirir. SQL Server offline modunda kullanılamaz.';
}
