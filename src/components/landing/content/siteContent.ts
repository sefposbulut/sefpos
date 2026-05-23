import type { LucideIcon } from 'lucide-react';
import {
  Monitor,
  Package,
  Globe,
  Bike,
  QrCode,
  Users,
  BarChart3,
  Shield,
  Zap,
  Database,
  PhoneIncoming,
  Printer,
  Clock,
  Wallet,
  Truck,
  Building2,
  Scale,
  Bell,
  Cloud,
  Server,
  Sparkles,
  Gift,
} from 'lucide-react';

export const SITE = {
  name: 'ŞefPOS',
  /** Ticari / iletişim unvanı */
  companyName: 'ŞefPOS Adisyon',
  tagline: 'Restoran operasyonlarının tek komuta merkezi',
  phone: '0544 244 90 80',
  phoneTel: 'tel:+905442449080',
  whatsapp: 'https://wa.me/905442449080',
  email: 'bilgi@sefpos.com.tr',
  /** Merkez ofis — tam adres */
  addressLine: 'Acalar Mahallesi, Hanım Eli Sokak No:10',
  addressCity: 'Turgutlu / Manisa',
  address: 'Acalar Mahallesi, Hanım Eli Sokak No:10 — Turgutlu / Manisa',
  /** Google Haritalar arama metni */
  mapsQuery: 'Acalar Mahallesi Hanım Eli Sokak No 10 Turgutlu Manisa Türkiye',
  trialDays: 14,
} as const;

export function googleMapsSearchUrl(query: string = SITE.mapsQuery): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsEmbedUrl(query: string = SITE.mapsQuery): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&hl=tr&z=16&output=embed`;
}

export const CONTACT_HOURS = 'Pazartesi – Cumartesi · 09:00 – 18:00';

export const CONTACT_CHANNELS = [
  {
    id: 'phone',
    label: 'Telefon',
    value: SITE.phone,
    href: SITE.phoneTel,
    hint: 'Satış ve teknik destek',
  },
  {
    id: 'email',
    label: 'E-posta',
    value: SITE.email,
    href: `mailto:${SITE.email}`,
    hint: 'Teklif ve genel bilgi',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    value: 'Hızlı mesaj',
    href: SITE.whatsapp,
    hint: 'Kurulum ve destek hattı',
    external: true,
  },
] as const;

export const CONTACT_SUPPORT_TOPICS = [
  'Ücretsiz deneme ve demo randevusu',
  'Kurulum, eğitim ve uzaktan bağlantı desteği',
  'Getir, Yemeksepeti, Trendyol entegrasyonları',
  'Windows kasa programı ve güncelleme',
  'Bayi / iş ortaklığı başvurusu',
] as const;

export type LandingRoute =
  | '/'
  | '/ozellikler'
  | '/entegrasyonlar'
  | '/fiyatlar'
  | '/indir'
  | '/bayi'
  | '/iletisim';

export const LANDING_NAV: { label: string; path: LandingRoute }[] = [
  { label: 'Ana Sayfa', path: '/' },
  { label: 'Özellikler', path: '/ozellikler' },
  { label: 'Entegrasyonlar', path: '/entegrasyonlar' },
  { label: 'Fiyatlar', path: '/fiyatlar' },
  { label: 'İndir', path: '/indir' },
  { label: 'Bayiler', path: '/bayi' },
  { label: 'İletişim', path: '/iletisim' },
];

export type FeatureItem = {
  icon: LucideIcon;
  title: string;
  desc: string;
  tag?: string;
};

export const HERO_STATS = [
  { value: '500+', label: 'Aktif işletme' },
  { value: '99,9%', label: 'Bulut uptime' },
  { value: '81', label: "İl'de kullanım" },
  { value: '<2 sn', label: 'Sipariş açma' },
];

export const TRUST_ITEMS = [
  'Gerçek adisyon & POS',
  'Türkçe arayüz',
  'Yerel destek',
  'Ücretsiz kurulum desteği',
  'Otomatik güncelleme',
] as const;

export const INDUSTRIES = [
  'Restoran',
  'Kebap & Izgara',
  'Cafe',
  'Fast Food',
  'Pizza',
  'Pastane',
  'Otel F&B',
  'Franchise',
  'Paket ağırlıklı',
] as const;

export const WORKFLOW_STEPS = [
  { step: '01', title: 'Sipariş alın', desc: 'Masa, paket, QR veya online platform — tek ekrandan giriş.' },
  { step: '02', title: 'Mutfak & bar', desc: 'Otomatik fiş, kategori bazlı yazıcı yönlendirme, anlık durum.' },
  { step: '03', title: 'Ödeme & kapanış', desc: 'Parçalı ödeme, açık hesap, vardiya ve gün sonu raporu.' },
  { step: '04', title: 'Yönetim paneli', desc: 'Şube, stok, personel ve satış analitiği tek merkezden.' },
] as const;

export const PROOF_POINTS = [
  {
    icon: Monitor,
    title: 'Profesyonel adisyon',
    desc: 'Masa birleştirme, transfer, garson ataması ve ödeme kilidi — klasik restoran adisyonunun dijital hali.',
  },
  {
    icon: Package,
    title: 'Paket & online hattı',
    desc: 'Caller ID, binlerce açık paket listesi, Getir / YS / Trendyol / Migros tek merkezde.',
  },
  {
    icon: Shield,
    title: 'Kurumsal güven',
    desc: 'Kiracı izolasyonu, lisans yönetimi, yedekleme ve şube SQL modu ile kesintisiz iş.',
  },
] as const;

export const MODULE_HIGHLIGHTS = [
  { label: 'Masa salon', icon: Monitor },
  { label: 'Paket servis', icon: Package },
  { label: 'Online sipariş', icon: Globe },
  { label: 'Kurye', icon: Bike },
  { label: 'QR menü', icon: QrCode },
  { label: 'Kasa', icon: Wallet },
  { label: 'Stok & sayım', icon: Scale },
  { label: 'Raporlar', icon: BarChart3 },
  { label: 'Personel', icon: Users },
  { label: 'Yazıcı', icon: Printer },
  { label: 'Vardiya', icon: Clock },
  { label: 'Sadakat', icon: Gift },
  { label: 'Bildirim', icon: Sparkles },
] as const;

export const CORE_FEATURES: FeatureItem[] = [
  {
    icon: Monitor,
    title: 'Masa & salon yönetimi',
    desc: 'Gerçek zamanlı masa durumu, birleştirme, transfer ve garson ataması. Yoğun saatte bile tek ekrandan kontrol.',
    tag: 'Sıcak yol',
  },
  {
    icon: Package,
    title: 'Paket servis & Caller ID',
    desc: 'Telefon çaldığında müşteri tanıma, hızlı sipariş formu, binlerce açık paket için optimize liste.',
    tag: 'Yeni',
  },
  {
    icon: Globe,
    title: 'Online sipariş merkezi',
    desc: 'Getir, Yemeksepeti, Trendyol ve Migros siparişleri tek panelde; onay, fiş, mutfak ve kurye akışı.',
  },
  {
    icon: Bike,
    title: 'Kurye & teslimat',
    desc: 'Kurye atama, canlı durum, müşteri adresi ve teslimat fişi. Kurye mobil ekranı ile senkron.',
  },
  {
    icon: QrCode,
    title: 'QR menü',
    desc: 'Masadan QR ile menü; garson çağrısı ve sipariş talepleri doğrudan POS’a düşer.',
  },
  {
    icon: BarChart3,
    title: 'Raporlar & gün sonu',
    desc: 'Şube bazlı satış, iptal logları, vardiya kapanışı ve detaylı sayım raporları.',
  },
];

export const ADVANCED_FEATURES: FeatureItem[] = [
  { icon: Users, title: 'Personel & yetkiler', desc: 'Garson, kasiyer, mutfak, yönetici rolleri; PIN kilidi ve cihaz bağlama.' },
  { icon: Wallet, title: 'Kasa & ödeme', desc: 'Nakit, kart, parçalı ödeme, açık hesap, sadakat puanı ve hızlı satış modu.' },
  { icon: Scale, title: 'Stok & sayım', desc: 'Ürün sayımı, stok hareketleri ve mutfak reçete takibi.' },
  { icon: Printer, title: 'Yazıcı & terazi', desc: 'Mutfak/adisyon fişi, online sipariş fişi; terazi entegrasyonu.' },
  { icon: Bell, title: 'Garson çağrı zili', desc: 'QR veya masa üzerinden garson talebi — anlık bildirim.' },
  { icon: Clock, title: 'Vardiya yönetimi', desc: 'Açılış/kapanış, gün kilidi ve vardiya bazlı raporlama.' },
  { icon: Cloud, title: 'Bulut + çevrimdışı', desc: 'Supabase altyapısı; kesintide yerel SQL Server şube modu (Electron).' },
  { icon: Server, title: 'Şube sunucusu', desc: 'İnternet kesilse bile şube içi SQL Server ile POS çalışmaya devam eder.' },
  { icon: Shield, title: 'Güvenlik & lisans', desc: 'Kiracı izolasyonu, lisans paneli, otomatik masaüstü güncelleme.' },
  { icon: Database, title: 'Merkezi veri', desc: 'Tüm şubeler tek panelden; gerçek zamanlı senkronizasyon.' },
  { icon: Sparkles, title: 'Kurumsal bildirim', desc: 'Lisans panelinden anlık duyuru; restoran ekranında canlı banner.' },
  { icon: Gift, title: 'Sadakat programı', desc: 'Ödeme ekranından puan kazanma ve kullanma; cari borçtan bağımsız müşteri kartı.' },
];

export type IntegrationItem = {
  code: string;
  name: string;
  desc: string;
  color: string;
};

export const INTEGRATIONS: IntegrationItem[] = [
  {
    code: 'getir',
    name: 'Getir Yemek',
    desc: 'Webhook + API ile sipariş alma, durum güncelleme ve teslimat tercihleri fişte.',
    color: 'from-purple-600 to-violet-700',
  },
  {
    code: 'yemeksepeti',
    name: 'Yemeksepeti',
    desc: 'Sipariş onayı, iptal ve yeniden baskı; mutfak fişi otomatik.',
    color: 'from-rose-600 to-red-700',
  },
  {
    code: 'trendyol',
    name: 'Trendyol Go',
    desc: 'Yoğun saatlerde bile stabil poll ve anlık bildirim sesi.',
    color: 'from-orange-500 to-amber-600',
  },
  {
    code: 'migros',
    name: 'Migros Yemek',
    desc: 'Platform siparişleri tek listede; personel eğitimi minimum.',
    color: 'from-orange-600 to-orange-700',
  },
  {
    code: 'hemenyolda',
    name: 'HemenYolda',
    desc: 'Sertifikalı entegrasyon; sipariş push, güncelleme ve iptal akışı.',
    color: 'from-sky-600 to-blue-700',
  },
];

export const COMPARISON_ROWS = [
  { label: 'Tüm platformlar tek panel', sefpos: true, generic: false },
  { label: 'Caller ID ile müşteri tanıma', sefpos: true, generic: false },
  { label: '1000+ açık paket performansı', sefpos: true, generic: false },
  { label: 'Geçmiş adisyon & kalem görüntüleme', sefpos: true, generic: 'Kısıtlı' },
  { label: 'QR menü + garson çağrısı', sefpos: true, generic: 'Kısıtlı' },
  { label: 'Sadakat puanı (kazan / kullan)', sefpos: true, generic: 'Kısıtlı' },
  { label: 'Şube SQL + bulut hibrit', sefpos: true, generic: false },
  { label: 'Otomatik masaüstü güncelleme', sefpos: true, generic: 'Manuel' },
  { label: 'Türkçe destek & yerel kurulum', sefpos: true, generic: 'Değişken' },
];

export const TESTIMONIALS = [
  {
    quote: 'Online siparişler artık kaçmıyor. Getir ve Yemeksepeti aynı ekranda; mutfak anında görüyor.',
    name: 'Ahmet Y.',
    role: 'İşletme sahibi — Kebap & Izgara, İstanbul',
  },
  {
    quote: 'Paket hattında telefon çalınca müşteri adı geliyor, sipariş 10 saniyede açılıyor. Personel çok memnun.',
    name: 'Fatma K.',
    role: 'Operasyon müdürü — Cafe, Ankara',
  },
  {
    quote: 'Gün sonu ve vardiya raporları sayesinde şube müdürleri her akşam net kapanış yapıyor.',
    name: 'Mehmet D.',
    role: 'Franchise koordinatörü — Pizza, İzmir',
  },
];

export type PricingFeatureGroup = {
  title: string;
  items: string[];
};

export type PricingPlan = {
  name: string;
  ideal: string;
  highlight?: boolean;
  badge?: string;
  tier: 1 | 2 | 3;
  limits: string[];
  groups: PricingFeatureGroup[];
  excluded?: string[];
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Başlangıç',
    ideal: 'Tek şube — salon ve kasa temeli',
    highlight: true,
    badge: 'En popüler',
    tier: 1,
    limits: ['1 şube', '3 kullanıcı', '14 gün deneme'],
    groups: [
      {
        title: 'Salon Yönetimi',
        items: ['Masa haritası', 'Sipariş girişi', 'Temel garson / kasa rolleri'],
      },
      {
        title: 'Kasa ve Ödeme',
        items: ['Nakit ve kart ödeme', 'Adisyon ve mutfak fişi'],
      },
      {
        title: 'Mutfak',
        items: ['Otomatik mutfak fişi', '1 yazıcı yönlendirme'],
      },
      {
        title: 'Raporlama',
        items: ['Günlük ciro özeti', 'Gün sonu kapanış'],
      },
    ],
    excluded: ['Online platformlar', 'Paket / Caller ID', 'QR menü', 'Kurye', 'Stok', 'Çok şube'],
  },
  {
    name: 'Profesyonel',
    ideal: 'Salon + paket + online — tam restoran',
    tier: 2,
    limits: ['3 şube', '15 kullanıcı', 'Öncelikli destek'],
    groups: [
      {
        title: 'Salon Yönetimi',
        items: ['Canlı masa haritası', 'Masa birleştirme / transfer', 'Hesap kilidi', 'Garson mobil ekran'],
      },
      {
        title: 'Paket Servisi',
        items: ['Caller ID', 'Müşteri ve adres kaydı', 'Açık paket listesi', 'Kurye atama ve ekranı'],
      },
      {
        title: 'Online Sipariş',
        items: ['Getir · Yemeksepeti · Trendyol', 'Migros · HemenYolda', 'Sesli uyarı · platform fişi'],
      },
      {
        title: 'Kasa ve Ödeme',
        items: ['Parçalı / karma ödeme', 'Veresiye (cari)', 'Sadakat puanı', 'Geçmiş adisyon', 'İptal kayıtları'],
      },
      {
        title: 'QR Menü',
        items: ['Dijital menü', 'Garson çağrı zili', 'QR sipariş talebi'],
      },
      {
        title: 'Mutfak ve Yazıcı',
        items: ['Kategori bazlı yazıcılar', 'Online otomatik fiş', 'Terazi entegrasyonu'],
      },
      {
        title: 'Stok ve Rapor',
        items: ['Stok sayımı', 'Kritik stok uyarısı', 'Vardiya', 'Performans raporları'],
      },
      {
        title: 'Personel',
        items: ['Rol ve yetki', 'PIN ile giriş', 'Kullanıcı yönetimi'],
      },
    ],
  },
  {
    name: 'Kurumsal',
    ideal: 'Zincir ve franchise — tam teşekküllü',
    badge: 'Tam donanım',
    tier: 3,
    limits: ['Sınırsız şube', 'Sınırsız kullanıcı', 'SLA 7/24'],
    groups: [
      { title: 'Profesyonel paket', items: ['Tüm Profesyonel modüller dahil'] },
      {
        title: 'Zincir ve Şube',
        items: ['Tek panel çok şube', 'Merkez canlı izleme', 'Şube karşılaştırma', 'Franchise yönetimi'],
      },
      {
        title: 'Kesintisiz çalışma',
        items: ['Şube SQL modu', 'Windows kasa + Caller ID', 'Veri izolasyonu', 'Bulut yedekleme'],
      },
      {
        title: 'Stok ve Maliyet',
        items: ['Reçete ve maliyet', 'Tedarikçi / alış', 'Dönemsel sayım analizi'],
      },
      {
        title: 'Raporlama',
        items: ['Konsolide çok şube rapor', 'Detaylı kırılımlar', 'Özel rapor talebi'],
      },
      {
        title: 'Personel ve Güvenlik',
        items: ['Sınırsız rol şablonları', 'Merkezi yetki politikası', 'Denetim kayıtları'],
      },
      {
        title: 'Kurumsal hizmet',
        items: ['Özel eğitim', 'Kurulum danışmanlığı', 'API / özel entegrasyon', 'Özel hesap yöneticisi'],
      },
    ],
  },
];

/** Ana sayfa önizlemesi */
export function pricingPlanFeaturePreview(plan: PricingPlan, max = 6): string[] {
  const flat = [...plan.limits, ...plan.groups.flatMap((g) => g.items)];
  if (flat.length <= max) return flat;
  return [...flat.slice(0, max - 1), `+${flat.length - max + 1} özellik`];
}

export const FAQ_ITEMS = [
  {
    q: 'İnternet kesilirse ne olur?',
    a: 'Electron masaüstü sürümünde şube SQL Server modu ile salon içi çalışmaya devam edebilirsiniz. Bağlantı gelince veriler senkronize edilir.',
  },
  {
    q: 'Mevcut yazarkasam / terazim çalışır mı?',
    a: 'Yaygın ESC/POS yazıcılar ve terazi protokolleri desteklenir. Kurulumda birlikte test ediyoruz.',
  },
  {
    q: 'Online platform kurulumunu kim yapıyor?',
    a: 'Getir, Yemeksepeti ve Trendyol bağlantılarında adım adım rehber ve uzaktan destek veriyoruz.',
  },
  {
    q: 'Verilerim nerede duruyor?',
    a: 'Bulut veritabanı Türkiye odaklı Supabase altyapısında; kiracı bazlı izolasyon ve düzenli yedekleme.',
  },
];

export const RESELLER_TIERS = [
  { title: 'Başlangıç Bayi', commission: '%15', volume: '0–10 lisans / yıl', perks: ['Peşin komisyon', 'Eğitim materyali', 'Teknik destek hattı'] },
  { title: 'Profesyonel Bayi', commission: '%20', volume: '11–50 lisans', highlight: true, perks: ['Haftalık ödeme', 'Bölgesel tanıtım', 'Öncelikli destek', 'Demo hesabı'] },
  { title: 'Kurumsal Bayi', commission: '%25', volume: '50+ lisans', perks: ['Günlük ödeme', 'Özel hesap yöneticisi', 'API erişimi', 'Ortak pazarlama'] },
];
