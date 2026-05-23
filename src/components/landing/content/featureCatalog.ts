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
  Gift,
} from 'lucide-react';

export type CatalogBullet = {
  title: string;
  desc: string;
};

/** hero-dashboard = salon mockup · platforms = online · scene = modül UI sahnesi */
export type FeatureVisual = 'hero-dashboard' | 'platforms' | 'scene';

export type FeatureCategory = {
  id: string;
  icon: LucideIcon;
  /** Mega menü ve özellik listesinde görünen ad */
  menuLabel: string;
  title: string;
  lead: string;
  /** Sağ panelde görünen tanıtım metni */
  pitch: string;
  /** Tanıtım altında 3 kısa vurgu */
  highlights: string[];
  bullets: CatalogBullet[];
  visual?: FeatureVisual;
  /** Tam sayfa sonunda kapanış cümlesi */
  outro?: string;
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
  {
    icon: Gift,
    title: 'Sadakat puanı',
    desc: 'Ödeme ekranından puan kazanma ve kullanma; cari hesaptan ayrı müşteri kartı.',
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
export type PresentationVisual = 'brand' | 'hero-dashboard' | 'platforms' | 'scene';

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

function slideVisualForModule(id: string): PresentationVisual | undefined {
  if (id === 'salon') return 'hero-dashboard';
  if (id === 'online') return 'platforms';
  return 'scene';
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
    eyebrow: cat.menuLabel,
    title: cat.title,
    subtitle: cat.pitch,
    bullets: cat.highlights,
    visual: cat.visual ?? slideVisualForModule(cat.id),
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
    menuLabel: 'Salon Yönetimi',
    title: 'Salonda masa adisyonu',
    lead: 'Garson masayı açar, ürünleri girer, mutfak görür, hesap kapanınca ödeme alınır — klasik restoran düzeni, dijital.',
    pitch:
      'Salon Yönetimi ile masalarınızı canlı haritada izleyin; doluluk, hesap tutarı ve garson ataması tek bakışta. Yoğun saatte bile sipariş girişi hızlı kalır, ödeme sırasında masa kilidi ile hata riski azalır.',
    highlights: ['Canlı masa haritası ve renk kodları', 'Garson mobil ekranı', 'Masa birleştirme ve transfer'],
    visual: 'hero-dashboard',
    bullets: [
      { title: 'Canlı masa görünümü', desc: 'Boş, dolu, hesap isteyen veya ödeme aşamasındaki masalar renklerle belli.' },
      { title: 'Masa birleştirme ve taşıma', desc: 'Kalabalık masaları birleştirin veya siparişi başka masaya aktarın.' },
      { title: 'Kolay sipariş girişi', desc: 'Ürün, porsiyon, not ve ikram; yoğun saatte hızlı dokunmatik kullanım.' },
      { title: 'Hesap kilidi', desc: 'Ödeme sırasında masaya yanlışlıkla yeni ürün eklenmesini engeller.' },
      { title: 'Garson ekranı', desc: 'Garsonlar telefon veya tabletten masalarına sipariş girebilir.' },
      { title: 'Salondan pakete', desc: 'Müşteri pakete geçmek isterse siparişi paket hattına tek hamlede aktarın.' },
    ],
    outro: 'Salon operasyonunuz tek ekranda toplanır; garson, kasa ve mutfak aynı veriyi görür.',
  },
  {
    id: 'paket',
    icon: Package,
    menuLabel: 'Paket Servisi Yönetimi',
    title: 'Paket servis ve telefon siparişi',
    lead: 'Paket yoğun işletmeler için: telefon çalınca müşteri tanınır, adres ve ürünler hızlı girilir.',
    pitch:
      'Telefon çaldığında kayıtlı müşteri ve adres ekrana gelir; yeni müşteriyi saniyeler içinde kaydedip siparişe başlarsınız. Yüzlerce açık paket siparişinde bile liste ve arama akıcı çalışır.',
    highlights: ['Caller ID ile otomatik müşteri', 'Hızlı adres ve ürün girişi', 'Kurye atama ve durum'],
    visual: 'scene',
    bullets: [
      { title: 'Telefonla müşteri tanıma', desc: 'Kayıtlı numara çalınca isim ve adres ekrana gelir; yeni müşteri hemen kaydedilir.' },
      { title: 'Hızlı sipariş formu', desc: 'Telefon, isim ve adres yazarken sistem takılmaz; yoğun saate göre tasarlandı.' },
      { title: 'Açık paket listesi', desc: 'Yüzlerce açık sipariş olsa bile arama ve durum takibi akıcı.' },
      { title: 'Kurye atama', desc: 'Hangi sipariş hangi kuryede; yola çıktı, teslim edildi bilgisi.' },
      { title: 'Paket satış raporu', desc: 'Günlük ve haftalık paket cirosu; hangi ürünler pakette öne çıkıyor görün.' },
    ],
    outro: 'Telefon ve paket hattı tek sistemde; müşteri kaydı, sipariş ve kurye ayrı defterlere dağılmaz.',
  },
  {
    id: 'online',
    icon: Globe,
    menuLabel: 'Online Sipariş Yönetimi',
    title: 'Online yemek siparişleri',
    lead: 'Getir, Yemeksepeti, Trendyol, Migros ve HemenYolda siparişleri ayrı tabletlere değil, doğrudan ŞefPOS’a düşer.',
    pitch:
      'Tüm online yemek platformları tek listede toplanır; yeni sipariş sesli uyarıyla gelir, onay ve iptal kasadan yapılır. Platform logolu fişler mutfak ve adisyon yazıcılarına otomatik gider — ayrı tablet karmaşası biter.',
    highlights: ['Getir · Yemeksepeti · Trendyol · Migros · HemenYolda', 'Sesli yeni sipariş uyarısı', 'Otomatik mutfak fişi'],
    visual: 'platforms',
    bullets: [
      { title: 'Getir Yemek', desc: 'Sipariş onayı, hazırlanıyor ve teslimat durumları programdan güncellenir.' },
      { title: 'Yemeksepeti', desc: 'Sipariş gelince sesli uyarı; mutfak fişi ve iptal işlemleri tek ekrandan.' },
      { title: 'Trendyol Go', desc: 'Yoğun saatlerde bile sipariş kaçırmadan liste ve onay.' },
      { title: 'Migros Yemek', desc: 'Platform siparişleri diğerleriyle aynı listede; personel tek ekran öğrenir.' },
      { title: 'HemenYolda', desc: 'Entegre teslimat akışı; sipariş ve durum senkron.' },
      { title: 'Platform fişi', desc: 'Her platformun siparişi okunaklı fişle mutfağa ve adisyona gider.' },
    ],
    outro: 'Online sipariş kaçırmazsınız; platformlar kasanızda, mutfağınızda — ayrı tablet karmaşası olmadan.',
  },
  {
    id: 'kasa',
    icon: Wallet,
    menuLabel: 'Kasa ve Ödeme Yönetimi',
    title: 'Kasa, ödeme ve hesap',
    lead: 'Nakit, kart, parçalı ödeme ve veresiye; hesap kapanışı ve geçmiş adisyonlar elinizin altında.',
    pitch:
      'Masada veya pakette nakit, kart ve karma ödeme alın; veresiye cari takibi yapın. Kapanmış adisyonları tarihe göre bulup içeriğini görün, fişi yeniden yazdırın — denetim ve müşteri talepleri için hazırsınız.',
    highlights: ['Parçalı ve karma ödeme', 'Geçmiş adisyon arama', 'İptal ve denetim kayıtları'],
    visual: 'scene',
    bullets: [
      { title: 'Esnek ödeme', desc: 'Nakit, kredi kartı, karma ödeme; masada veya pakette aynı kolaylık.' },
      { title: 'Hızlı satış', desc: 'Masası olmayan tezgah satışları için ayrı hızlı satış ekranı.' },
      { title: 'Açık hesap (veresiye)', desc: 'Müşteri cari takibi; borç ve tahsilat hareketleri.' },
      { title: 'Sadakat puanı', desc: 'Ödeme sırasında puan kazanma ve indirim; cari borçtan ayrı çalışır.' },
      { title: 'Geçmiş adisyonlar', desc: 'Kapanmış siparişleri tarihe göre bulun; + ile içeriği görün, fişi yeniden yazdırın.' },
      { title: 'İptal kayıtları', desc: 'Hangi ürün kim tarafından iptal edildi — şeffaf denetim.' },
    ],
    outro: 'Ödeme ve hesap kapanışı şeffaf; geçmişe dönük arama ile denetim ve müşteri talepleri kolay.',
  },
  {
    id: 'mutfak',
    icon: Printer,
    menuLabel: 'Mutfak Yönetimi',
    title: 'Mutfak, bar ve yazıcılar',
    lead: 'Sipariş mutfağa ve bara doğru yazıcıdan çıkar; ayarlar merkezden yönetilir.',
    pitch:
      'Sipariş girildiği anda doğru yazıcıya fiş gider: ana yemek mutfağa, içecek bara, tatlı pastaya. Online platform siparişleri de aynı düzenle basılır; personel tek sistemi öğrenir.',
    highlights: ['Kategori bazlı yazıcı yönlendirme', 'Adisyon ve mutfak fişi', 'Terazi entegrasyonu'],
    visual: 'scene',
    bullets: [
      { title: 'Otomatik mutfak fişi', desc: 'Ana yemek, içecek, tatlı farklı yazıcılara yönlendirilebilir.' },
      { title: 'Adisyon yazdırma', desc: 'Müşteri hesabı ve yeniden yazdırma; restoran bilgileri fişte.' },
      { title: 'Online sipariş baskısı', desc: 'Platform siparişi onaylanınca mutfak fişi otomatik.' },
      { title: 'Terazi desteği', desc: 'Gramajlı ürünlerde teraziden ağırlık alma.' },
    ],
    outro: 'Mutfak ve bar doğru fişi alır; online ve salon siparişleri aynı yazıcı düzenine girer.',
  },
  {
    id: 'kurye',
    icon: Bike,
    menuLabel: 'Kurye ve Teslimat Takibi',
    title: 'Kurye ve teslimat',
    lead: 'Paket siparişi mutfaktan çıktıktan sonra kurye ve müşteriye kadar takip.',
    pitch:
      'Kurye kendi ekranında yalnızca kendine atanan siparişleri görür; adres ve notlar net yazılır. Merkez yola çıktı ve teslim edildi bilgisini anında takip eder.',
    highlights: ['Kurye mobil ekranı', 'Anlık durum güncelleme', 'Şube bazlı kurye yönetimi'],
    visual: 'scene',
    bullets: [
      { title: 'Kurye ekranı', desc: 'Kurye sadece kendine atanan siparişleri görür; adres ve notlar net.' },
      { title: 'Durum güncelleme', desc: 'Yola çıktı, teslim edildi — merkez anında görür.' },
      { title: 'Kurye yönetimi', desc: 'Hangi kurye hangi şubede; performans takibi.' },
    ],
    outro: 'Teslimat süreci görünür; müşteri “kurye nerede?” sorusuna anında cevap verirsiniz.',
  },
  {
    id: 'qr',
    icon: QrCode,
    menuLabel: 'Dijital QR Menü',
    title: 'QR menü ve garson çağrısı',
    lead: 'Müşteri masadaki QR ile menüye bakar; garson çağırabilir.',
    pitch:
      'Masadaki QR kod güncel menüyü gösterir; fiyat değişikliği anında yansır. Müşteri garson veya hesap istediğinde kasada bildirim düşer, servis hızlanır.',
    highlights: ['Güncel dijital menü', 'Garson çağrı zili', 'İsteğe bağlı QR sipariş'],
    visual: 'scene',
    bullets: [
      { title: 'Dijital menü', desc: 'Fiyat ve ürün güncellemesi anında QR menüye yansır.' },
      { title: 'Garson çağrı zili', desc: 'Müşteri “garson” veya “hesap” dediğinde kasada bildirim.' },
      { title: 'Sipariş talebi', desc: 'İsterseniz QR’dan gelen talep siparişe dönüştürülür.' },
    ],
    outro: 'QR menü baskı maliyetini azaltır; fiyat güncellemesi anında masaya yansır.',
  },
  {
    id: 'stok',
    icon: Scale,
    menuLabel: 'Stok ve Maliyet Yönetimi',
    title: 'Stok ve maliyet',
    lead: 'Ne kadar malzeme kaldı, sayım ne zaman yapıldı — mutfak maliyetini kontrol altında tutun.',
    pitch:
      'Reçete ile ürün başına malzeme tüketimini izleyin; sayım belgeleri ve tedarikçi alışları tek yerde. Kritik stok uyarısı ile bitmek üzere olan malzemeyi önceden görürsünüz.',
    highlights: ['Dönemsel stok sayımı', 'Reçete ve maliyet', 'Kritik stok uyarısı'],
    visual: 'scene',
    bullets: [
      { title: 'Stok sayımı', desc: 'Dönemsel sayım belgeleri; şube bazlı stok girişi.' },
      { title: 'Reçete', desc: 'Ürün başına malzeme listesi; tüketim takibi.' },
      { title: 'Tedarikçi ve alış', desc: 'Gelen mal faturası ve tedarikçi kartları.' },
      { title: 'Kritik stok uyarısı', desc: 'Bitmek üzere olan malzemeler için uyarı.' },
    ],
    outro: 'Maliyet kontrolü elinizde; sayım, reçete ve tedarikçi hareketleri tek modülde.',
  },
  {
    id: 'rapor',
    icon: BarChart3,
    menuLabel: 'Raporlama ve Analiz',
    title: 'Raporlar ve gün sonu',
    lead: 'İşletme sahibi ve müdür için: bugün ne sattık, kasada ne kaldı, hangi garson ne yaptı.',
    pitch:
      'Günlük ve haftalık ciro, ürün ve kategori kırılımı, garson performansı tek ekranda. Vardiya açılış-kapanış ve gün sonu rutini ile kasadaki parayı net kapatırsınız.',
    highlights: ['Satış ve ürün raporları', 'Vardiya ve gün sonu', 'Çok şube karşılaştırma'],
    visual: 'scene',
    bullets: [
      { title: 'Satış raporları', desc: 'Günlük, haftalık ciro; ürün ve kategori kırılımı.' },
      { title: 'Personel performansı', desc: 'Garson ve kasiyer bazlı özet.' },
      { title: 'Vardiya', desc: 'Vardiya açılış/kapanış, nakit sayımı, vardiya raporu yazdırma.' },
      { title: 'Gün sonu', desc: 'İş günü kapanışı; günü net kapatma rutini.' },
      { title: 'Şube karşılaştırma', desc: 'Birden fazla şubede hangisi önde — tek bakış.' },
    ],
    outro: 'İşletme sahibi için net tablo: bugün ne sattık, kasada ne kaldı, kim ne yaptı.',
  },
  {
    id: 'personel',
    icon: Users,
    menuLabel: 'Personel Yönetimi',
    title: 'Personel ve yetkiler',
    lead: 'Her çalışan sadece yapması gerekeni görür; kasa güvenliği ve hızlı kullanıcı değişimi.',
    pitch:
      'Garson, kasiyer ve yönetici için ayrı roller tanımlayın; indirim, iptal ve rapor erişimini sınırlayın. Ortak tablette PIN ile hızlı kullanıcı değişimi — kim ne yaptı kayıt altında.',
    highlights: ['Rol ve yetki tanımı', 'PIN ile hızlı giriş', 'Kullanıcı açma / kapama'],
    visual: 'scene',
    bullets: [
      { title: 'Rol tanımları', desc: 'Garson sipariş girer; kasiyer ödeme alır; yönetici rapor görür.' },
      { title: 'PIN ile giriş', desc: 'Ortak tablette bile kişi kendi koduyla girer.' },
      { title: 'Yetki sınırı', desc: 'İndirim, iptal ve rapor erişimi kontrollü.' },
      { title: 'Kullanıcı yönetimi', desc: 'Yeni personel ekleme, ayrılan personeli kapatma.' },
    ],
    outro: 'Personel değişimi hızlı, yetkiler net — kasada güvenlik ve hız bir arada.',
  },
  {
    id: 'sadakat',
    icon: Gift,
    menuLabel: 'Sadakat Programı',
    title: 'Müşteri sadakat puanı',
    lead: 'Düzenli müşterilerinizi ödüllendirin: her ödemede puan kazansınlar, sonraki ziyarette indirim kullansınlar.',
    pitch:
      'Sadakat programı cari veresiyeden ayrı çalışır; aynı müşteri kartında puan bakiyesi tutulur. Kasada isim veya telefonla müşteri bulun, puan kullanın veya kazandırın — salon, paket ve hızlı satış ödemelerinde geçerlidir.',
    highlights: ['Ödeme ekranından puan kullanımı', 'Otomatik puan kazanımı', 'Ayarlar → Sadakat ile kurallar'],
    visual: 'scene',
    bullets: [
      { title: 'Puan kazanma', desc: 'Her X TL harcamada otomatik puan; kurallar işletmeye göre ayarlanır.' },
      { title: 'Puan kullanma', desc: 'Ödeme modalında müşteri seçip puanı indirime çevirin; minimum kullanım limiti tanımlanabilir.' },
      { title: 'Hızlı müşteri kartı', desc: 'Kayıtlı değilse ödeme anında isim/telefon ile sadakat müşterisi oluşturun.' },
      { title: 'Cari hesaptan ayrı', desc: 'Veresiye borcu ile sadakat puanı karışmaz; aynı müşteride iki ayrı bakiye.' },
      { title: 'Sadakat menüsü', desc: 'En çok puanı olan müşteriler ve işlem geçmişi özeti.' },
      { title: 'Salon ve hızlı satış', desc: 'Masa adisyonu ve tezgah satışında aynı sadakat akışı.' },
    ],
    outro: 'Müşteri bağlılığını artırın; puan kazanma ve kullanma kasada birkaç dokunuşla biter.',
  },
  {
    id: 'sube',
    icon: Building2,
    menuLabel: 'Zincir ve Şube Yönetimi',
    title: 'Çok şube ve kesintisiz çalışma',
    lead: 'Zincir veya birden fazla şubesi olan işletmeler: merkezden izleme, şubede internet kesilse bile salon açık kalabilir.',
    pitch:
      'Tek hesaptan tüm şubeleri yönetin; merkez ofis canlı doluluk ve siparişleri izler. Windows kasa programı yazıcı ve telefon hattıyla uyumlu çalışır; isteğe bağlı şube sunucusu ile internet kesintisinde salon içi operasyon sürer.',
    highlights: ['Tek panel, çok şube', 'Canlı merkez izleme', 'Windows kasa ve yedekleme'],
    visual: 'scene',
    bullets: [
      { title: 'Tek hesap, çok şube', desc: 'Şube değiştirerek o lokasyonun masalarını ve raporlarını görün.' },
      { title: 'Anlık senkron', desc: 'Merkez ofis şubedeki doluluk ve siparişleri canlı izleyebilir.' },
      { title: 'Windows kasa programı', desc: 'Yazıcı ve telefon hattı için masaüstü sürüm; otomatik güncellenir.' },
      { title: 'İnternet kesilirse', desc: 'İsteğe bağlı şube sunucusu ile salon içi çalışmaya devam (kurulumda planlanır).' },
      { title: 'Verileriniz güvende', desc: 'Her işletmenin verisi ayrı; düzenli yedekleme.' },
    ],
    outro: 'Zincir ve çok şubeli yapılar merkezden yönetilir; her lokasyon kendi kasasında çalışmaya devam eder.',
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
