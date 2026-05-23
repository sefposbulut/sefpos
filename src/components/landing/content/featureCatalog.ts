import type { LucideIcon } from 'lucide-react';
import {
  Monitor,
  Package,
  Globe,
  Bike,
  QrCode,
  Wallet,
  Printer,
  BarChart3,
  Users,
  Shield,
  Cloud,
  Clock,
  Scale,
  Bell,
  History,
  RefreshCw,
  Building2,
  Smartphone,
  Lock,
  Radio,
  FileText,
  Zap,
  Headphones,
  MapPin,
  UtensilsCrossed,
} from 'lucide-react';

export type CatalogBullet = {
  title: string;
  desc: string;
};

export type FeatureCategory = {
  id: string;
  icon: LucideIcon;
  title: string;
  lead: string;
  badge?: string;
  bullets: CatalogBullet[];
};

/** Ana sayfa özet kartları — müşteriye hızlı bakış */
export const HOME_FEATURE_SPOTLIGHT = [
  {
    icon: Monitor,
    title: 'Salon adisyonu',
    desc: 'Masa, birleştirme, transfer, garson ve ödeme kilidi — yoğun saate dayanıklı.',
  },
  {
    icon: Package,
    title: 'Paket servis',
    desc: 'Caller ID, hızlı müşteri formu, binlerce açık siparişte akıcı yazım.',
  },
  {
    icon: Globe,
    title: 'Online platformlar',
    desc: 'Getir, Yemeksepeti, Trendyol, Migros, HemenYolda tek merkezde.',
  },
  {
    icon: History,
    title: 'Geçmiş adisyonlar',
    desc: 'Kapanmış siparişleri listeleyin, kalemleri görün, yeniden yazdırın.',
  },
  {
    icon: RefreshCw,
    title: 'Otomatik güncelleme',
    desc: 'Windows kasa sürümü uzaktan güncellenir; zorunlu sürüm politikası.',
  },
  {
    icon: Shield,
    title: 'Kurumsal güven',
    desc: 'Kiracı izolasyonu, lisans paneli, yedekleme ve şube SQL modu.',
  },
] as const;

export const CATALOG_INTRO = {
  title: 'ŞefPOS özellik kataloğu',
  subtitle:
    'Restoran, cafe ve paket ağırlıklı işletmeler için uçtan uca adisyon, online sipariş, kasa, stok ve yönetim — tek platformda.',
  pitch:
    'ŞefPOS yalnızca kasa değil; salon operasyonundan platform entegrasyonlarına, vardiya kapanışından merkezi raporlamaya kadar günlük işinizi tek ekranda toplar. Türkçe arayüz, yerel destek ve otomatik masaüstü güncelleme ile sahada kanıtlanmış bir çözümdür.',
} as const;

/** Tam katalog — sunum, paylaşım ve /ozellikler sayfası */
export const FEATURE_CATALOG: FeatureCategory[] = [
  {
    id: 'salon',
    icon: Monitor,
    title: 'Salon & masa adisyonu',
    lead: 'Klasik restoran adisyonunun dijital hali: masa durumu, garson ve ödeme akışı gerçek zamanlı.',
    badge: 'Sıcak yol',
    bullets: [
      { title: 'Canlı masa haritası', desc: 'Dolu, boş, ödeme, temizlik durumları renk kodlu; şube bazlı filtre.' },
      { title: 'Masa birleştirme & transfer', desc: 'Siparişleri birleştirin veya başka masaya taşıyın; ödeme geçmişi korunur.' },
      { title: 'Sipariş paneli', desc: 'Ürün, varyant, not, ikram ve iptal; parçalı ödeme ile uyumlu kalem takibi.' },
      { title: 'Ödeme kilidi', desc: 'Hesap kapanırken çift ödeme ve müdahaleyi engelleyen masa kilidi.' },
      { title: 'Garson uygulaması', desc: 'Mobil garson ekranı; masa bazlı sipariş ve durum senkronu.' },
      { title: 'Masadan pakete aktarım', desc: 'Salon siparişini paket hattına tek tıkla taşıyın.' },
    ],
  },
  {
    id: 'paket',
    icon: Package,
    title: 'Paket servis & Caller ID',
    lead: 'Telefon ve paket hattı için optimize edilmiş form; yoğun listede donmadan çalışır.',
    badge: 'Performans',
    bullets: [
      { title: 'Caller ID entegrasyonu', desc: 'Telefon çaldığında kayıtlı müşteri adı, adres ve geçmiş sipariş önerisi.' },
      { title: 'Hızlı müşteri formu', desc: 'Telefon, isim, adres alanlarında akıcı yazım; arka planda gereksiz yenileme yok.' },
      { title: 'Müşteri arama', desc: 'Telefon ve isimle hızlı kayıt bulma; minimum karakter ile akıllı arama.' },
      { title: 'Kurye atama', desc: 'Paket siparişine kurye bağlama, durum ve teslimat notları.' },
      { title: 'Paket raporları', desc: 'Şube ve dönem bazlı paket satış, ödeme ve performans özeti.' },
    ],
  },
  {
    id: 'online',
    icon: Globe,
    title: 'Online sipariş merkezi',
    lead: 'Tüm yemek platformları tek panelde; onay, mutfak fişi ve iptal akışı standart.',
    bullets: [
      { title: 'Getir Yemek', desc: 'Webhook ve API; sipariş alma, durum güncelleme, teslimat tercihleri fişte.' },
      { title: 'Yemeksepeti / Delivery Hero', desc: 'Onay, iptal, yeniden baskı; mutfak yönlendirmesi otomatik.' },
      { title: 'Trendyol Go', desc: 'Stabil poll, anlık bildirim sesi ve yoğun saat dayanıklılığı.' },
      { title: 'Migros Yemek', desc: 'Platform siparişleri ortak listede; minimum personel eğitimi.' },
      { title: 'HemenYolda', desc: 'Sertifikalı entegrasyon; push, güncelleme ve iptal senkronu.' },
      { title: 'Online sipariş fişi', desc: 'Platform logolu fiş şablonları; adisyon ve mutfak yazıcılarına yönlendirme.' },
    ],
  },
  {
    id: 'kasa',
    icon: Wallet,
    title: 'Kasa, ödeme & hızlı satış',
    lead: 'Nakit, kart, parçalı ödeme ve açık hesap — kasa kapanışı ile uyumlu.',
    bullets: [
      { title: 'Ödeme modalı', desc: 'Çoklu ödeme yöntemi, indirim ve kalem bazlı ödeme desteği.' },
      { title: 'Hızlı satış', desc: 'Masasız perakende satış; barkod ve ürün ızgarası.' },
      { title: 'Açık hesap / cari', desc: 'Müşteri borç ve tahsilat; hareket detayı ve sipariş bağlantısı.' },
      { title: 'Geçmiş adisyonlar', desc: 'Kapanmış siparişleri listeleyin; + ile kalemleri görün, adisyonu yeniden yazdırın.' },
      { title: 'İptal logları', desc: 'Kim, ne zaman, hangi kalemi iptal etti — denetim izi.' },
    ],
  },
  {
    id: 'mutfak',
    icon: Printer,
    title: 'Mutfak, yazıcı & fiş',
    lead: 'Kategori bazlı yazıcı yönlendirme; bulut ayarları tüm kasalara senkron.',
    bullets: [
      { title: 'Adisyon & mutfak fişi', desc: 'ESC/POS yazıcılar; adisyon, mutfak ve bar ayrımı.' },
      { title: 'Buluttan yazıcı ayarı', desc: 'Restoran adı, telefon, adres ve alt bilgi merkezi yönetim.' },
      { title: 'Online sipariş baskısı', desc: 'Platform siparişi gelince otomatik veya onay sonrası fiş.' },
      { title: 'Terazi entegrasyonu', desc: 'Ağırlıklı ürünlerde kasa terazisi desteği.' },
      { title: 'Yeniden yazdırma', desc: 'Geçmiş sipariş adisyonunu aynı şablonda tekrar gönderme.' },
    ],
  },
  {
    id: 'kurye',
    icon: Bike,
    title: 'Kurye & teslimat',
    lead: 'Sahada kurye mobil ekranı; merkezden canlı takip.',
    bullets: [
      { title: 'Kurye uygulaması', desc: 'Atanan siparişler, adres ve durum güncelleme.' },
      { title: 'Canlı harita', desc: 'Kurye konum geçmişi ve şube bazlı görünüm.' },
      { title: 'Kurye yönetimi', desc: 'Personel tanımı, şube ataması ve performans.' },
    ],
  },
  {
    id: 'qr',
    icon: QrCode,
    title: 'QR menü & garson çağrı',
    lead: 'Masadan dijital menü; talepler doğrudan POS’a düşer.',
    bullets: [
      { title: 'QR menü yönetimi', desc: 'Kategori, ürün, fiyat; şube bazlı menü.' },
      { title: 'Garson çağrı zili', desc: 'Müşteri talebi anlık bildirim ve masa bilgisi.' },
      { title: 'Sipariş talebi', desc: 'QR üzerinden gelen talepler sipariş paneline aktarılabilir.' },
    ],
  },
  {
    id: 'stok',
    icon: Scale,
    title: 'Stok, reçete & sayım',
    lead: 'Mutfak maliyeti ve kritik stok için envanter modülü.',
    bullets: [
      { title: 'Ürün stok sayımı', desc: 'Sayım belgesi, parti ve şube bazlı stok girişi.' },
      { title: 'Reçeteler & malzemeler', desc: 'Ürün–malzeme ilişkisi; tüketim takibi.' },
      { title: 'Tedarikçi & alış faturaları', desc: 'Giriş faturaları ve tedarikçi kartları.' },
      { title: 'Kritik stok uyarısı', desc: 'Eşik altı ürünlerde uyarı ve sayım önerisi.' },
    ],
  },
  {
    id: 'rapor',
    icon: BarChart3,
    title: 'Raporlar, vardiya & gün sonu',
    lead: 'Yönetici için net kapanış; şube ve personel kırılımı.',
    bullets: [
      { title: 'Satış & ürün raporları', desc: 'Dönem, şube ve kategori bazlı ciro analizi.' },
      { title: 'Personel raporu', desc: 'Garson ve kasiyer performans özeti.' },
      { title: 'Vardiya yönetimi', desc: 'Açılış/kapanış nakit, vardiya raporu yazdırma.' },
      { title: 'Gün sonu / iş günü', desc: 'İş günü kilidi, otomatik yetim sipariş temizliği.' },
      { title: 'Şube raporu', desc: 'Çok şubeli yapılarda merkezi karşılaştırma.' },
    ],
  },
  {
    id: 'personel',
    icon: Users,
    title: 'Personel, yetki & cihaz',
    lead: 'Kim ne yapabilir; hangi kasa hangi şubeye bağlı — net kurallar.',
    bullets: [
      { title: 'Rol & yetkiler', desc: 'Garson, kasiyer, yönetici; kalem silme, indirim, rapor erişimi.' },
      { title: 'PIN kilidi', desc: 'Oturum zaman aşımı ve hızlı kullanıcı değişimi.' },
      { title: 'Cihaz bağlama', desc: 'Kasa cihazını şube ve lisans ile eşleştirme.' },
      { title: 'Kullanıcı yönetimi', desc: 'Davet, pasif kullanıcı engeli, garson/kasa listesi.' },
    ],
  },
  {
    id: 'sube',
    icon: Building2,
    title: 'Çok şube & hibrit altyapı',
    lead: 'Bulut merkez + isteğe bağlı şube SQL; kesintide iş durmaz.',
    bullets: [
      { title: 'Şube yönetimi', desc: 'Tek hesapta birden fazla şube; şube seçici ve filtreler.' },
      { title: 'Gerçek zamanlı senkron', desc: 'Masa ve sipariş değişiklikleri anlık yansır.' },
      { title: 'SQL Server şube modu', desc: 'Electron ile yerel SQL; internet kesilince salon içi devam.' },
      { title: 'Performans indeksleri', desc: 'Yoğun saat için veritabanı ve istemci optimizasyonları.' },
    ],
  },
  {
    id: 'masaustu',
    icon: RefreshCw,
    title: 'Windows masaüstü & güncelleme',
    lead: 'Kasa için native uygulama; yazıcı ve Caller ID ile tam entegrasyon.',
    badge: 'Electron',
    bullets: [
      { title: 'Otomatik güncelleme', desc: 'Yeni sürüm indirilir; onaylı kurulum ile kesintisiz geçiş.' },
      { title: 'Zorunlu sürüm politikası', desc: 'Merkezden minimum sürüm ve zorunlu güncelleme tanımı.' },
      { title: 'Güvenli yerel ayar', desc: 'Hassas ayarlar şifreli yerel depoda (DPAPI).' },
      { title: 'Web + masaüstü', desc: 'Aynı hesap; tarayıcıdan yönetim, kasada masaüstü performansı.' },
    ],
  },
  {
    id: 'kurumsal',
    icon: Shield,
    title: 'Kurumsal lisans & uzaktan yönetim',
    lead: 'Distribütör ve zincirler için merkezi lisans, bildirim ve destek araçları.',
    badge: 'Ayka panel',
    bullets: [
      { title: 'Lisans & KPI paneli', desc: 'Kiracı listesi, aktiflik, sürüm ve kullanım özeti.' },
      { title: 'Güncelleme politikası', desc: 'Minimum sürüm, zorunlu güncelleme aç/kapa.' },
      { title: 'Uzaktan yerel veri silme', desc: 'Kasa AppData temizliği komutu (bulut verisi silinmez).' },
      { title: 'Anlık bildirimler', desc: 'Destek ve duyuru mesajları kasa ekranında.' },
      { title: 'Kiracı silme (cascade)', desc: 'Test veya kapanan işletme için kontrollü tam silme.' },
    ],
  },
  {
    id: 'guvenlik',
    icon: Lock,
    title: 'Güvenlik & yedekleme',
    lead: 'Veri izolasyonu ve operasyonel süreklilik.',
    bullets: [
      { title: 'Kiracı izolasyonu', desc: 'Her restoran verisi RLS ile ayrı; çapraz erişim yok.' },
      { title: 'Üretim güvenliği', desc: 'Masaüstüde üretim modunda geliştirici araçları kapalı.' },
      { title: 'Yedekleme stratejisi', desc: 'Bulut günlük yedek + haftalık dış yedek (şifreli).' },
      { title: 'Oturum & cihaz', desc: 'Pasif kullanıcı ve silinmiş cihazda giriş engeli.' },
    ],
  },
  {
    id: 'entegrasyon-api',
    icon: Radio,
    title: 'API & ortak sipariş',
    lead: 'Özel entegrasyon ve franchise IT ihtiyaçları.',
    bullets: [
      { title: 'Partner Pull API', desc: 'Dış sistemlerin sipariş çekmesi için dokümante REST API.' },
      { title: 'Hugin TPS / ödeme', desc: 'Yazar kasa ve ödeme cihazı entegrasyon yolları.' },
      { title: 'OpenAPI dokümantasyon', desc: 'Geliştiriciler için canlı API referansı.' },
    ],
  },
];

export const SALES_HIGHLIGHTS = [
  { icon: Zap, text: 'Kurulum ve eğitim desteği — Türkçe' },
  { icon: Headphones, text: '0544 244 90 80 · WhatsApp destek hattı' },
  { icon: MapPin, text: "81 ilde kullanım — bölgesel SEO sayfaları" },
  { icon: UtensilsCrossed, text: 'Restoran odaklı — genel market POS değil' },
  { icon: FileText, text: 'Katalog PDF: tarayıcıdan yazdır → PDF olarak kaydet' },
  { icon: Cloud, text: 'Bulut + şube SQL hibrit mimari' },
] as const;
