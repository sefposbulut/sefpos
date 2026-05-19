import { INDUSTRIES } from './siteContent';

export const SEO_SOLUTIONS = [
  {
    key: 'adisyon',
    title: 'Adisyon Yazılımı',
    desc: 'Masa ve paket siparişlerini hızlı açın; mutfak fişi, ödeme ve gün sonu tek ekranda.',
  },
  {
    key: 'barkod',
    title: 'Barkod Sistemi',
    desc: 'Ürün ve stok hareketlerini barkodla takip edin; kasada hızlı satış.',
  },
  {
    key: 'restoran',
    title: 'Restoran Yazılımı',
    desc: 'Salon düzeni, garson atama, çoklu ödeme ve raporlama ile tam restoran yönetimi.',
  },
  {
    key: 'masa',
    title: 'Masa Takip Sistemi',
    desc: 'Dolu-boş masalar, süre ve tutar görünürlüğü; yoğun saatte karışıklık olmaz.',
  },
] as const;

export const SEO_SECTORS = INDUSTRIES;

export const SEO_FEATURES_SHORT = [
  'Online platform entegrasyonları (Getir, Yemeksepeti, Trendyol, Migros)',
  'Caller ID ile hızlı paket siparişi',
  'Bulut yedekleme ve otomatik güncelleme',
  'Türkçe arayüz ve yerel destek',
  'Windows masaüstü + web erişim',
] as const;

export function districtPageTitle(districtName: string, provinceName: string): string {
  return `${districtName} Adisyon Yazılımı ve Restoran POS | ${provinceName}`;
}

export function districtMetaDescription(
  districtName: string,
  provinceName: string,
  region: string,
): string {
  return `${districtName}, ${provinceName} işletmeleri için ŞefPOS: adisyon yazılımı, barkod sistemi, restoran yazılımı ve masa takip sistemi. ${region} bölgesinde kurulum ve Türkçe destek.`;
}

export function provincePageTitle(provinceName: string): string {
  return `${provinceName} Adisyon Yazılımı — Tüm İlçeler | ŞefPOS`;
}

export function provinceMetaDescription(provinceName: string, districtCount: number, region: string): string {
  return `${provinceName} genelinde ${districtCount} ilçede restoran, cafe ve paket servis için adisyon ve POS çözümü. ${region} bölgesi — ŞefPOS ile masa, online sipariş ve raporlama.`;
}
