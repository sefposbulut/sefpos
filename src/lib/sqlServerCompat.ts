import { isSqlServerMode } from './sqlDb';
import { isHybridMode, isHybridCloudLinked } from './hybridMode';

/** Bulutta çalışır; saf SQL offline kurulumda devre dışı (hata yerine bilgi). */
export const SQL_ONLINE_ONLY_PAGES = new Set([
  'online-orders',
  'integrations',
  'partner-api',
  'platforms',
]);

/** SQL modunda tam desteklenen POS modülleri (offline). */
export const SQL_OFFLINE_MODULES = [
  'Masalar ve sipariş',
  'Ödeme ve adisyon',
  'Ürün / menü',
  'Paket servis (manuel)',
  'Kasa ve vardiya',
  'Gün sonu',
  'Stok / reçete (patch sonrası)',
  'Yazdırma (yerel print_jobs)',
  'Garson terminali (aynı SQL)',
  'Cari müşteri',
  'Raporlar',
] as const;

export function isSqlOnlineOnlyPage(page: string): boolean {
  if (!isSqlServerMode()) return false;
  if (isHybridMode() && isHybridCloudLinked()) return false;
  return SQL_ONLINE_ONLY_PAGES.has(page);
}

export function sqlOnlineOnlyPageMessage(page: string): string {
  if (isHybridMode() && !isHybridCloudLinked()) {
    return 'Hibrit mod: önce bulut hesabını bağlayın (kurulum sihirbazı veya Ayarlar). Bağlandıktan sonra mobil garson bulut üzerinden çalışır.';
  }
  if (page === 'online-orders') {
    return 'Online siparişler (Getir / Yemeksepeti) yalnızca bulut bağlantısında çalışır. Hibrit modda kasa SQL, platform siparişleri buluttan senkron edilir.';
  }
  return 'Bu bölüm internet ve bulut hesabı gerektirir. Saf SQL modunda kullanılamaz; hibrit modda bulut bağlantısı gerekir.';
}
