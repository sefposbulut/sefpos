/**
 * Tenant bazlı modül görünürlüğü.
 *
 * Süper-admin lisans panelinden bir müşterinin sadece "Hızlı Satış" kullansın
 * (masaları/online siparişleri görmesin) gibi seçimler yapabilsin diye burada
 * tek bir modül kataloğu tutuyoruz. Hem AdminPanel hem MainMenu hem de gerekirse
 * Settings burayı referans alır.
 *
 * Listenin **kodları** veritabanında `tenants.disabled_modules text[]` içinde
 * saklanır. Mevcut müşterilerin disabled_modules'ı boş array olduğundan eski
 * davranış (her şey görünür) bozulmaz.
 *
 * NOT: Yönetim/kasiyer fonksiyonu olan **Ayarlar, Kullanıcı Yönetimi**
 * vb. asla disable edilmez — bu seçenekleri kataloğa hiç koymuyoruz ki
 * yanlışlıkla kapanıp tenant kendi kendini kilitlemesin.
 */

export type ToggleableModuleCode =
  | 'tables'
  | 'quick-sale'
  | 'takeaway'
  | 'online-orders'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'loyalty'
  | 'reports'
  | 'cashier'
  | 'shifts'
  | 'endofday'
  | 'cancel-logs';

export interface ToggleableModuleMeta {
  code: ToggleableModuleCode;
  label: string;
  description: string;
}

/**
 * UI'da görünen sıra ile birlikte modül listesi.
 * `label` Türkçe — AdminPanel'de checkbox yanında gösterilir.
 */
export const TOGGLEABLE_MODULES: ToggleableModuleMeta[] = [
  { code: 'tables',       label: 'Masalar',           description: 'Masa düzeni, sipariş alma, masa grupları' },
  { code: 'quick-sale',   label: 'Hızlı Satış',       description: 'Kasiyer modu — masa olmadan direkt satış' },
  { code: 'takeaway',     label: 'Paket Servis',      description: 'Paket sipariş paneli ve kurye ataması' },
  { code: 'online-orders',label: 'Online Siparişler', description: 'Yemeksepeti / Getir / Trendyol entegrasyonları' },
  { code: 'products',     label: 'Ürünler',           description: 'Ürün/kategori/varyant yönetimi' },
  { code: 'inventory',    label: 'Stok yönetimi',     description: 'Reçete, hammadde, tedarikçi, alış faturası' },
  { code: 'customers',    label: 'Cari Hesaplar',     description: 'Müşteri kartları, açık hesap takibi' },
  { code: 'loyalty',      label: 'Sadakat',           description: 'Müşteri puanı, ödeme ekranından kullanım' },
  { code: 'reports',      label: 'Raporlar',          description: 'Satış / şube / personel / ürün raporları' },
  { code: 'cashier',      label: 'Kasa Yönetimi',     description: 'Kasa giriş/çıkış işlemleri' },
  { code: 'shifts',       label: 'Vardiya',           description: 'Vardiya aç/kapat, çift bazlı sayım' },
  { code: 'endofday',     label: 'Gün Sonu',          description: 'Z raporu ve gün kapanışı' },
  { code: 'cancel-logs',  label: 'İptal Kayıtları',   description: 'İptal edilen ürün/sipariş logu' },
];

/** `disabled_modules` array'inden okunmuş kodlar Set'i. */
export function buildDisabledModuleSet(raw: unknown): Set<string> {
  if (Array.isArray(raw)) {
    return new Set(raw.filter((s) => typeof s === 'string'));
  }
  return new Set();
}

/**
 * Tenant kaydı verildiğinde belirli modülün açık olup olmadığını döner.
 * `tenant` null/undefined ise — bilinmeyen — varsayılan olarak `true` (açık)
 * kabul edilir. Modül kataloğunda olmayan kodlar da default açık sayılır.
 */
export function isModuleEnabled(
  code: ToggleableModuleCode | string,
  tenant: { disabled_modules?: string[] | null } | null | undefined,
): boolean {
  if (!tenant) return true;
  const list = tenant.disabled_modules;
  if (!Array.isArray(list) || list.length === 0) return true;
  return !list.includes(code);
}
