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
  Building2,
  History,
  Headphones,
  UtensilsCrossed,
  Clock,
  Scale,
} from 'lucide-react';

export type CatalogBullet = {
  title: string;
  desc: string;
};

export type FeatureCategory = {
  id: string;
  icon: LucideIcon;
  /** İçindekiler / sunum şeridinde kısa ad */
  shortLabel: string;
  title: string;
  lead: string;
  bullets: CatalogBullet[];
};

/** Ana sayfa — işletme sahibine kısa fayda */
export const HOME_FEATURE_SPOTLIGHT = [
  {
    icon: Monitor,
    title: 'Masada adisyon',
    desc: 'Hangi masa dolu, kim sipariş verdi, hesap ne kadar — hepsi bir bakışta.',
  },
  {
    icon: Package,
    title: 'Paket ve telefon',
    desc: 'Telefon çalınca müşteri bilgisi gelir; adres ve sipariş hızlı girilir.',
  },
  {
    icon: Globe,
    title: 'Online platformlar',
    desc: 'Getir, Yemeksepeti, Trendyol, Migros siparişleri aynı ekranda.',
  },
  {
    icon: History,
    title: 'Geçmiş adisyonlar',
    desc: 'Eski hesapları bulun, içinde ne vardı görün, fişi tekrar yazdırın.',
  },
  {
    icon: Headphones,
    title: 'Türkçe destek',
    desc: 'Kurulum, eğitim ve günlük sorularınız için yerel ekip.',
  },
  {
    icon: Building2,
    title: 'Çok şube',
    desc: 'Birden fazla şubenizi tek panelden izleyin ve karşılaştırın.',
  },
] as const;

export const CATALOG_INTRO = {
  title: 'ŞefPOS nedir, size ne sağlar?',
  subtitle:
    'Restoran, cafe ve paket servis işletmeleri için masa adisyonu, online sipariş, kasa ve raporlama — hepsi tek programda, Türkçe.',
  pitch:
    'ŞefPOS ile salon siparişinden telefon paketine, Getir ve Yemeksepeti siparişlerinden gün sonu raporuna kadar günlük işinizi tek yerden yönetirsiniz. Personel kolay öğrenir; siz de ciroyu ve kapanışı net görürsünüz.',
} as const;

/** Sunum slaytı — görsel: `public/landing/` altına koyun (örn. `/landing/salon.jpg`) */
export type PresentationVisual = 'brand' | 'hero-dashboard' | 'platforms' | 'module';

export type PresentationSlide = {
  id: string;
  /** FEATURE_CATALOG ile eşleşen modül (intro hariç) */
  catalogId?: string;
  eyebrow?: string;
  title: string;
  subtitle: string;
  bullets?: string[];
  image?: string;
  imageAlt?: string;
  visual?: PresentationVisual;
};

const CATALOG_IMAGES = ['/sefpos-brand.png', '/SEFPOS.png', '/sefpos-round.png', '/logo256.png', '/logo-header.png'] as const;

function slideVisualForModule(id: string): PresentationVisual | undefined {
  if (id === 'salon') return 'hero-dashboard';
  if (id === 'online') return 'platforms';
  return 'module';
}

function buildPresentationSlides(): PresentationSlide[] {
  const intro: PresentationSlide = {
    id: 'intro',
    eyebrow: 'Kurumsal katalog',
    title: 'ŞefPOS — restoran operasyon platformu',
    subtitle:
      'Salon adisyonundan online siparişe, mutfak fişinden gün sonu raporuna — tüm modüller tek Türkçe platformda.',
    image: '/sefpos-brand.png',
    imageAlt: 'ŞefPOS',
  };

  const modules = FEATURE_CATALOG.map((cat, i) => ({
    id: cat.id,
    catalogId: cat.id,
    eyebrow: cat.shortLabel,
    title: cat.title,
    subtitle: cat.lead,
    bullets: cat.bullets.map((b) => b.title),
    visual: slideVisualForModule(cat.id),
    image: slideVisualForModule(cat.id) ? undefined : CATALOG_IMAGES[i % CATALOG_IMAGES.length],
    imageAlt: cat.title,
  }));

  return [intro, ...modules];
}

/** Sunumun altında 3 ana mesaj */
export const PRESENTATION_PILLARS = [
  {
    icon: UtensilsCrossed,
    title: 'Tüm siparişler tek yerde',
    desc: 'Masa, paket, telefon ve online platformlar ayrı programlara dağılmaz; mutfak ve kasa aynı akışı görür.',
  },
  {
    icon: Printer,
    title: 'Fiş ve mutfak uyumlu',
    desc: 'Sipariş girilince doğru yazıcıya fiş gider; online siparişler de aynı düzenle işlenir.',
  },
  {
    icon: Clock,
    title: 'Gün sonu net',
    desc: 'Vardiya, nakit ve satış özeti; akşam kapanışta sürpriz kalmaz.',
  },
] as const;

/** Müşteri sunumu — /ozellikler (teknik detay yok) */
export const FEATURE_CATALOG: FeatureCategory[] = [
  {
    id: 'salon',
    icon: Monitor,
    shortLabel: 'Salon',
    title: 'Salonda masa adisyonu',
    lead: 'Garson masayı açar, ürünleri girer, mutfak görür, hesap kapanınca ödeme alınır — klasik restoran düzeni, dijital.',
    bullets: [
      { title: 'Canlı masa görünümü', desc: 'Boş, dolu, hesap isteyen veya ödeme aşamasındaki masalar renklerle belli.' },
      { title: 'Masa birleştirme ve taşıma', desc: 'Kalabalık masaları birleştirin veya siparişi başka masaya aktarın.' },
      { title: 'Kolay sipariş girişi', desc: 'Ürün, porsiyon, not ve ikram; yoğun saatte hızlı dokunmatik kullanım.' },
      { title: 'Hesap kilidi', desc: 'Ödeme sırasında masaya yanlışlıkla yeni ürün eklenmesini engeller.' },
      { title: 'Garson ekranı', desc: 'Garsonlar telefon veya tabletten masalarına sipariş girebilir.' },
      { title: 'Salondan pakete', desc: 'Müşteri pakete geçmek isterse siparişi paket hattına tek hamlede aktarın.' },
    ],
  },
  {
    id: 'paket',
    icon: Package,
    shortLabel: 'Paket',
    title: 'Paket servis ve telefon siparişi',
    lead: 'Paket yoğun işletmeler için: telefon çalınca müşteri tanınır, adres ve ürünler hızlı girilir.',
    bullets: [
      { title: 'Telefonla müşteri tanıma', desc: 'Kayıtlı numara çalınca isim ve adres ekrana gelir; yeni müşteri hemen kaydedilir.' },
      { title: 'Hızlı sipariş formu', desc: 'Telefon, isim ve adres yazarken sistem takılmaz; yoğun saate göre tasarlandı.' },
      { title: 'Açık paket listesi', desc: 'Yüzlerce açık sipariş olsa bile arama ve durum takibi akıcı.' },
      { title: 'Kurye atama', desc: 'Hangi sipariş hangi kuryede; yola çıktı, teslim edildi bilgisi.' },
      { title: 'Paket satış raporu', desc: 'Günlük ve haftalık paket cirosu; hangi ürünler pakette öne çıkıyor görün.' },
    ],
  },
  {
    id: 'online',
    icon: Globe,
    shortLabel: 'Online',
    title: 'Online yemek siparişleri',
    lead: 'Getir, Yemeksepeti, Trendyol, Migros ve HemenYolda siparişleri ayrı tabletlere değil, doğrudan ŞefPOS’a düşer.',
    bullets: [
      { title: 'Getir Yemek', desc: 'Sipariş onayı, hazırlanıyor ve teslimat durumları programdan güncellenir.' },
      { title: 'Yemeksepeti', desc: 'Sipariş gelince sesli uyarı; mutfak fişi ve iptal işlemleri tek ekrandan.' },
      { title: 'Trendyol Go', desc: 'Yoğun saatlerde bile sipariş kaçırmadan liste ve onay.' },
      { title: 'Migros Yemek', desc: 'Platform siparişleri diğerleriyle aynı listede; personel tek ekran öğrenir.' },
      { title: 'HemenYolda', desc: 'Entegre teslimat akışı; sipariş ve durum senkron.' },
      { title: 'Platform fişi', desc: 'Her platformun siparişi okunaklı fişle mutfağa ve adisyona gider.' },
    ],
  },
  {
    id: 'kasa',
    icon: Wallet,
    shortLabel: 'Kasa',
    title: 'Kasa, ödeme ve hesap',
    lead: 'Nakit, kart, parçalı ödeme ve veresiye; hesap kapanışı ve geçmiş adisyonlar elinizin altında.',
    bullets: [
      { title: 'Esnek ödeme', desc: 'Nakit, kredi kartı, karma ödeme; masada veya pakette aynı kolaylık.' },
      { title: 'Hızlı satış', desc: 'Masası olmayan tezgah satışları için ayrı hızlı satış ekranı.' },
      { title: 'Açık hesap (veresiye)', desc: 'Müşteri cari takibi; borç ve tahsilat hareketleri.' },
      { title: 'Geçmiş adisyonlar', desc: 'Kapanmış siparişleri tarihe göre bulun; + ile içeriği görün, fişi yeniden yazdırın.' },
      { title: 'İptal kayıtları', desc: 'Hangi ürün kim tarafından iptal edildi — şeffaf denetim.' },
    ],
  },
  {
    id: 'mutfak',
    icon: Printer,
    shortLabel: 'Mutfak',
    title: 'Mutfak, bar ve yazıcılar',
    lead: 'Sipariş mutfağa ve bara doğru yazıcıdan çıkar; ayarlar merkezden yönetilir.',
    bullets: [
      { title: 'Otomatik mutfak fişi', desc: 'Ana yemek, içecek, tatlı farklı yazıcılara yönlendirilebilir.' },
      { title: 'Adisyon yazdırma', desc: 'Müşteri hesabı ve yeniden yazdırma; restoran bilgileri fişte.' },
      { title: 'Online sipariş baskısı', desc: 'Platform siparişi onaylanınca mutfak fişi otomatik.' },
      { title: 'Terazi desteği', desc: 'Gramajlı ürünlerde teraziden ağırlık alma.' },
    ],
  },
  {
    id: 'kurye',
    icon: Bike,
    shortLabel: 'Kurye',
    title: 'Kurye ve teslimat',
    lead: 'Paket siparişi mutfaktan çıktıktan sonra kurye ve müşteriye kadar takip.',
    bullets: [
      { title: 'Kurye ekranı', desc: 'Kurye sadece kendine atanan siparişleri görür; adres ve notlar net.' },
      { title: 'Durum güncelleme', desc: 'Yola çıktı, teslim edildi — merkez anında görür.' },
      { title: 'Kurye yönetimi', desc: 'Hangi kurye hangi şubede; performans takibi.' },
    ],
  },
  {
    id: 'qr',
    icon: QrCode,
    shortLabel: 'QR Menü',
    title: 'QR menü ve garson çağrısı',
    lead: 'Müşteri masadaki QR ile menüye bakar; garson çağırabilir.',
    bullets: [
      { title: 'Dijital menü', desc: 'Fiyat ve ürün güncellemesi anında QR menüye yansır.' },
      { title: 'Garson çağrı zili', desc: 'Müşteri “garson” veya “hesap” dediğinde kasada bildirim.' },
      { title: 'Sipariş talebi', desc: 'İsterseniz QR’dan gelen talep siparişe dönüştürülür.' },
    ],
  },
  {
    id: 'stok',
    icon: Scale,
    shortLabel: 'Stok',
    title: 'Stok ve maliyet',
    lead: 'Ne kadar malzeme kaldı, sayım ne zaman yapıldı — mutfak maliyetini kontrol altında tutun.',
    bullets: [
      { title: 'Stok sayımı', desc: 'Dönemsel sayım belgeleri; şube bazlı stok girişi.' },
      { title: 'Reçete', desc: 'Ürün başına malzeme listesi; tüketim takibi.' },
      { title: 'Tedarikçi ve alış', desc: 'Gelen mal faturası ve tedarikçi kartları.' },
      { title: 'Kritik stok uyarısı', desc: 'Bitmek üzere olan malzemeler için uyarı.' },
    ],
  },
  {
    id: 'rapor',
    icon: BarChart3,
    shortLabel: 'Raporlar',
    title: 'Raporlar ve gün sonu',
    lead: 'İşletme sahibi ve müdür için: bugün ne sattık, kasada ne kaldı, hangi garson ne yaptı.',
    bullets: [
      { title: 'Satış raporları', desc: 'Günlük, haftalık ciro; ürün ve kategori kırılımı.' },
      { title: 'Personel performansı', desc: 'Garson ve kasiyer bazlı özet.' },
      { title: 'Vardiya', desc: 'Vardiya açılış/kapanış, nakit sayımı, vardiya raporu yazdırma.' },
      { title: 'Gün sonu', desc: 'İş günü kapanışı; günü net kapatma rutini.' },
      { title: 'Şube karşılaştırma', desc: 'Birden fazla şubede hangisi önde — tek bakış.' },
    ],
  },
  {
    id: 'personel',
    icon: Users,
    shortLabel: 'Personel',
    title: 'Personel ve yetkiler',
    lead: 'Her çalışan sadece yapması gerekeni görür; kasa güvenliği ve hızlı kullanıcı değişimi.',
    bullets: [
      { title: 'Rol tanımları', desc: 'Garson sipariş girer; kasiyer ödeme alır; yönetici rapor görür.' },
      { title: 'PIN ile giriş', desc: 'Ortak tablette bile kişi kendi koduyla girer.' },
      { title: 'Yetki sınırı', desc: 'İndirim, iptal ve rapor erişimi kontrollü.' },
      { title: 'Kullanıcı yönetimi', desc: 'Yeni personel ekleme, ayrılan personeli kapatma.' },
    ],
  },
  {
    id: 'sube',
    icon: Building2,
    shortLabel: 'Çok şube',
    title: 'Çok şube ve kesintisiz çalışma',
    lead: 'Zincir veya birden fazla şubesi olan işletmeler: merkezden izleme, şubede internet kesilse bile salon açık kalabilir.',
    bullets: [
      { title: 'Tek hesap, çok şube', desc: 'Şube değiştirerek o lokasyonun masalarını ve raporlarını görün.' },
      { title: 'Anlık senkron', desc: 'Merkez ofis şubedeki doluluk ve siparişleri canlı izleyebilir.' },
      { title: 'Windows kasa programı', desc: 'Yazıcı ve telefon hattı için masaüstü sürüm; otomatik güncellenir.' },
      { title: 'İnternet kesilirse', desc: 'İsteğe bağlı şube sunucusu ile salon içi çalışmaya devam (kurulumda planlanır).' },
      { title: 'Verileriniz güvende', desc: 'Her işletmenin verisi ayrı; düzenli yedekleme.' },
    ],
  },
];

export function getCatalogFeatureCount(): number {
  return FEATURE_CATALOG.reduce((n, c) => n + c.bullets.length, 0);
}

export const CATALOG_STATS = [
  { value: String(FEATURE_CATALOG.length), label: 'Ana modül' },
  { value: `${getCatalogFeatureCount()}+`, label: 'Detaylı işlev' },
  { value: '5', label: 'Online platform' },
  { value: '14', label: 'Gün ücretsiz deneme' },
] as const;

export const PRESENTATION_SLIDES: PresentationSlide[] = buildPresentationSlides();

export function getCatalogModuleById(id: string): FeatureCategory | undefined {
  return FEATURE_CATALOG.find((c) => c.id === id);
}
