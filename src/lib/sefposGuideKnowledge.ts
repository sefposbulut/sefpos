/**
 * ŞefPOS akıllı kurulum / kullanım rehberi — yerel bilgi tabanı.
 */

export type GuideTopicId =
  | 'welcome'
  | 'mode'
  | 'business'
  | 'tables'
  | 'products'
  | 'categories'
  | 'stock'
  | 'stock-groups'
  | 'orders'
  | 'package'
  | 'payments'
  | 'shifts'
  | 'printers'
  | 'users'
  | 'reports'
  | 'online';

export type GuideArticle = {
  id: GuideTopicId;
  title: string;
  summary: string;
  coach: string;
  steps: string[];
  tips: string[];
  /** Kullanım kılavuzu — menü yolu */
  menuPath?: string;
  /** Kılavuzda gösterilecek ekstra açıklama paragrafları */
  manual?: string[];
  keywords: string[];
  pages?: string[];
  onboardingStep?: number;
  category: 'baslangic' | 'satis' | 'stok' | 'yonetim' | 'entegrasyon';
};

export const GUIDE_CATEGORIES: { id: GuideArticle['category']; label: string }[] = [
  { id: 'baslangic', label: 'Başlangıç' },
  { id: 'satis', label: 'Satış & Masa' },
  { id: 'stok', label: 'Ürün & Stok' },
  { id: 'yonetim', label: 'Yönetim' },
  { id: 'entegrasyon', label: 'Entegrasyon' },
];

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    id: 'welcome',
    title: 'ŞefPOS nasıl çalışır?',
    summary: 'Restoranınızı masalar, ürünler ve ödemelerle yönetirsiniz.',
    category: 'baslangic',
    menuPath: 'Ana ekran',
    coach:
      'Merhaba! Ben ŞefPOS rehberiniz. Önce işletmeyi tanımlarız, sonra masaları ve menüyü kurarız. Sipariş → mutfak/yazıcı → ödeme akışı böyle ilerler.',
    steps: [
      'Çalışma modunu seçin (web için Sunucu/Bulut önerilir).',
      'Adres ve telefon bilgilerini girin.',
      'Salon/masa düzenini oluşturun.',
      'Ürün ve kategorileri ekleyin.',
      'İlk siparişi bir masadan alın.',
    ],
    tips: [
      'Kurulumu 2–3 dakikada bitirebilirsiniz; detayları sonra da düzenlersiniz.',
      'Rehberi istemezseniz kapatabilirsiniz; menüden tekrar açılır.',
    ],
    manual: [
      'ŞefPOS üç ana parçadan oluşur: Masalar (salon), Ürünler (menü) ve Ödeme/Kasa.',
      'Her masa bir sipariş noktasıdır. Ürünler kategorilere ayrılır. Gün sonunda vardiya/kasa ile rakamlar kapanır.',
      'Takıldığınızda bu kılavuzdan konuyu seçin veya asistan sekmesinde soru yazın.',
    ],
    keywords: ['nasıl', 'başla', 'kurulum', 'rehber', 'yardım', 'nedir', 'sefpos', 'kılavuz'],
    onboardingStep: 1,
  },
  {
    id: 'mode',
    title: 'Çalışma modları',
    summary: 'Sunucu, bağımsız veya karma — verinin nerede tutulduğu.',
    category: 'baslangic',
    menuPath: 'Kurulum sihirbazı → Çalışma modu',
    coach:
      'Web (VDS) kullanıyorsanız Sunucu/Bulut seçin: veriler sunucuda kalır, telefon ve tabletten de girersiniz. Bağımsız ve Karma, kasadaki masaüstü program içindir.',
    steps: [
      'Sunucu/Bulut: tarayıcı + sunucu veritabanı.',
      'Bağımsız: internet yokken bile kasada çalışır (masaüstü).',
      'Karma: kasada offline, internet gelince senkron (masaüstü).',
    ],
    tips: ['Yanlış seçseniz bile Ayarlar’dan sonra değiştirebilirsiniz.'],
    manual: [
      'Sunucu/Bulut (önerilen web): Tüm şubeler ve cihazlar aynı verilere bakar.',
      'Bağımsız: Veri bilgisayarda kalır; internet şart değildir.',
      'Karma: Kasa kesintide çalışır, bağlantı gelince sunucuyla birleşir.',
    ],
    keywords: ['mod', 'online', 'offline', 'hybrid', 'bulut', 'sunucu', 'vds', 'bağımsız'],
    onboardingStep: 2,
  },
  {
    id: 'business',
    title: 'İşletme bilgileri',
    summary: 'Adres ve telefon fiş / raporlarda görünür.',
    category: 'baslangic',
    menuPath: 'Kurulum → İşletme bilgileri / Ayarlar',
    coach:
      'Buradaki adres ve telefon işletme kimliğinizdir. Fişlerde, raporlarda ve müşteri iletişimlerinde kullanılır. İl ve ilçeyi doğru seçin.',
    steps: ['Adresi yazın', 'İl ve ilçe seçin', 'Cep / sabit telefon girin'],
    tips: ['Website isteğe bağlıdır.'],
    manual: [
      'Bu bilgiler müşteri fişinde ve resmi raporlarda görünebilir.',
      'Sonradan Ayarlar veya işletme profilinden güncelleyebilirsiniz.',
    ],
    keywords: ['adres', 'telefon', 'işletme', 'il', 'ilçe', 'firma'],
    onboardingStep: 3,
  },
  {
    id: 'tables',
    title: 'Masalar ve bölgeler',
    summary: 'Salon, bahçe gibi gruplar; her masa bir sipariş noktasıdır.',
    category: 'satis',
    menuPath: 'Masalar / Ayarlar → Masalar',
    coach:
      'Önce bir bölge adı verin (ör. Salon), kısa bir önek seçin (S). Sistem S-1, S-2… masalarını oluşturur. Garson masaya tıklayınca sipariş başlar.',
    steps: [
      'Bölge adı girin (Salon, Bahçe…).',
      'Önek belirleyin (otomatik de gelir).',
      'Kaç masa istediğinizi seçin.',
      'İsterseniz sonra Ayarlar → Masalar’dan ekleyin.',
    ],
    tips: [
      'Masa sayısı yanlışsa “atla” deyip sonra ekleyebilirsiniz.',
      'Aynı isimde masa numarası aynı şubede tekrar edemez.',
    ],
    manual: [
      'Masalar ekranında renkler genelde durumu gösterir: boş, dolu, hesap bekliyor.',
      'Bölge (grup) ile salonu bahçeden ayırırsınız; önek fiş ve ekranda kısa kod olur.',
      'Masayı birleştirme / taşıma işlemleri sipariş panelinden yapılır (yetkiye bağlı).',
    ],
    keywords: ['masa', 'salon', 'bölge', 'grup', 'table'],
    pages: ['tables'],
    onboardingStep: 4,
  },
  {
    id: 'products',
    title: 'Ürünler nasıl eklenir?',
    summary: 'Menüdeki her satır bir üründür; fiyat ve kategoriyle bağlanır.',
    category: 'stok',
    menuPath: 'Ürünler → Yeni ürün',
    coach:
      'Ürün = satılan yemek/içecek. Önce kategori açın (Çorbalar, Izgara…), sonra ürün ekleyin: ad, fiyat, isteğe bağlı barkod/görsel. POS’ta kategoriden ürüne tıklayınca sepete düşer.',
    steps: [
      'Ürünler menüsüne gidin.',
      'Kategori oluşturun.',
      '“Yeni ürün” ile ad + fiyat girin.',
      'Gerekirse varyant (küçük/büyük) ekleyin.',
      'Aktif olduğundan emin olun.',
    ],
    tips: [
      'Fiyatı kuruşlu yazabilirsiniz (örn. 189,90).',
      'Stok takibi istiyorsanız ürünü stok hareketlerine bağlayın.',
    ],
    manual: [
      'Pasif ürün menüde görünmez ama raporda geçmiş satışlar kalır.',
      'Barkod varsa hızlı satış / terazi ürünlerinde işinizi kolaylaştırır.',
      'Yazıcı adı verirseniz ürün mutfak fişinde ilgili yazıcıya gidebilir.',
    ],
    keywords: ['ürün', 'menü', 'fiyat', 'yemek', 'içecek', 'product', 'ekle'],
    pages: ['products'],
  },
  {
    id: 'categories',
    title: 'Kategoriler',
    summary: 'Ürünleri gruplayan menü başlıklarıdır.',
    category: 'stok',
    menuPath: 'Ürünler → Kategoriler',
    coach:
      'Kategori olmadan ürünler dağınık kalır. Örnek: Başlangıçlar, Ana Yemek, Tatlı, İçecek. POS ekranında önce kategori, sonra ürün görünür.',
    steps: ['Ürünler → Kategoriler', 'Ad ve renk seçin', 'Ürünleri kategoriye atayın'],
    tips: ['Sıralama (sort) ile menüdeki sırayı kontrol edersiniz.'],
    manual: [
      'Kategori = müşterinin gördüğü menü grupları.',
      'Stok grubu ile karıştırmayın: stok grubu depo/malzeme içindir.',
    ],
    keywords: ['kategori', 'grup', 'menü başlık', 'category'],
    pages: ['products'],
  },
  {
    id: 'stock',
    title: 'Stok nasıl çalışır?',
    summary: 'Malzeme ve ürün miktarlarını takip eder; satışta düşebilir.',
    category: 'stok',
    menuPath: 'Stok / Envanter',
    coach:
      'Stok iki katmandır: (1) Ürün stoğu — satışa hazır adet. (2) Malzeme/reçete — mutfak hammaddesi. Sayım belgesi ile gerçek sayıyı sisteme işlersiniz.',
    steps: [
      'Stok / Envanter ekranını açın.',
      'Malzeme veya ürün stoğunu seçin.',
      'Giriş (alış) veya sayım yapın.',
      'Kritik stok uyarılarını takip edin.',
    ],
    tips: [
      'Sadece paket satıyorsanız ürün stoğu yeterli olabilir.',
      'Restoranda reçete ile malzeme düşümü daha doğru sonuç verir.',
    ],
    manual: [
      'Alış faturası / stok girişi depo miktarını artırır.',
      'Sayım: rafta saydığınızı sisteme yazarsınız; fark düzeltmesi oluşur.',
      'Kritik stok: minimumun altına düşünce uyarı alırsınız.',
    ],
    keywords: ['stok', 'envanter', 'sayım', 'malzeme', 'stock', 'inventory'],
    pages: ['inventory', 'stock', 'ingredients'],
  },
  {
    id: 'stock-groups',
    title: 'Stok grubu nedir?',
    summary: 'Malzemeleri mutfak / bar / temizlik gibi gruplarda toplar.',
    category: 'stok',
    menuPath: 'Stok → Malzemeler / gruplar',
    coach:
      'Stok grubu, malzemeleri etiketlemektir: örn. “Et & Tavuk”, “İçecek Depo”, “Temizlik”. Rapor ve sayımda aynı gruptakileri birlikte görürsünüz. Ürün kategorisinden farklıdır: kategori menü içindir, stok grubu depo içindir.',
    steps: [
      'Envanter / malzemeler bölümüne gidin.',
      'Grup veya etiket alanından grup oluşturun.',
      'Her malzemeyi bir gruba bağlayın.',
      'Sayım ve sipariş raporlarını gruba göre filtreleyin.',
    ],
    tips: [
      'Başlangıçta 3–5 grup yeter: Mutfak, İçecek, Sarf, Diğer.',
      'Grup adı kısa ve anlaşılır olsun.',
    ],
    manual: [
      'Örnek gruplar: Et, Sebze, İçecek, Ambalaj, Temizlik.',
      'Aynı grubu hem sayım listesinde hem alış raporunda filtreleyebilirsiniz.',
      'Ürün kategorisi ≠ stok grubu. Menü kategorisi müşteriye, stok grubu depoya aittir.',
    ],
    keywords: ['stok grubu', 'stok grup', 'malzeme grubu', 'depo', 'grup'],
    pages: ['inventory', 'ingredients'],
  },
  {
    id: 'orders',
    title: 'Sipariş akışı',
    summary: 'Masa seç → ürün ekle → mutfağa gönder → ödeme al.',
    category: 'satis',
    menuPath: 'Masalar → Sipariş paneli',
    coach:
      'Masalar ekranından dolu/boş masayı görün. Masaya tıklayın, ürün ekleyin, kaydedin. Yazıcı tanımlıysa adisyon/mutfak fişi çıkar. Hesap kapatınca masa boşalır.',
    steps: ['Masalar', 'Ürün ekle', 'Kaydet / mutfağa gönder', 'Ödeme', 'Masayı kapat'],
    tips: ['İptal için yetki ve gerekçe ayarlarını Ayarlar’dan kontrol edin.'],
    manual: [
      'Sipariş kaydı anlıkdır; aynı masaya ikinci garson da ekleme yapabilir (kilite dikkat).',
      'İptal / iade logları yönetim raporunda görünür.',
    ],
    keywords: ['sipariş', 'adisyon', 'masa sipariş', 'order'],
    pages: ['tables', 'cashier', 'quick-sale'],
  },
  {
    id: 'package',
    title: 'Paket / gel-al',
    summary: 'Masasız siparişler: kurye veya müşteri teslim.',
    category: 'satis',
    menuPath: 'Paket / Takeaway',
    coach:
      'Paket serviste masa yoktur; müşteri adı/telefon ve adres girilir. Kurye atayıp durumu “yolda / teslim” olarak güncellersiniz. Gel-al için adres gerekmez.',
    steps: ['Paket / Takeaway ekranı', 'Müşteri bilgisi', 'Ürünler', 'Ödeme tipi', 'Kurye (opsiyonel)'],
    tips: ['Online platform siparişleri ayrı “Online Siparişler” ekranından gelir.'],
    manual: [
      'Gel-al: müşteri gelir alır; kurye gerekmez.',
      'Paket: adres + kurye durumu takip edilir.',
    ],
    keywords: ['paket', 'gel al', 'delivery', 'kurye', 'takeaway'],
    pages: ['takeaway', 'courier'],
  },
  {
    id: 'payments',
    title: 'Ödeme alma',
    summary: 'Nakit, kart, açık hesap veya karma ödeme.',
    category: 'satis',
    menuPath: 'Sipariş → Ödeme / Kasa',
    coach:
      'Hesap kapatırken tutarı seçin. Kısmi ödeme mümkünse kalan bakiye masada kalır. Gün sonu ve kasa raporları bu ödemelerden üretilir.',
    steps: ['Ödeme ekranını açın', 'Yöntem seçin', 'Tutar onaylayın', 'Fiş yazdırın (isteğe bağlı)'],
    tips: ['Açık hesap için önce müşteri kartı tanımlayın.'],
    manual: [
      'Karma ödeme: bir kısmı nakit, bir kısmı kart olabilir.',
      'Kasa hareketleri kasa ekranında ayrı izlenir.',
    ],
    keywords: ['ödeme', 'nakit', 'kart', 'hesap', 'payment'],
    pages: ['cashier', 'cash-register'],
  },
  {
    id: 'shifts',
    title: 'Vardiya',
    summary: 'Kasa açılış/kapanış ve personel mesaisi.',
    category: 'yonetim',
    menuPath: 'Vardiya / Gün sonu',
    coach:
      'Güne vardiya açarak başlayın: açılış kasası sayılır. Siparişler vardiyaya bağlanır. Kapanışta nakit sayımı ve fark raporu çıkar.',
    steps: ['Vardiya aç', 'Satış yap', 'Vardiya kapat / gün sonu'],
    tips: ['Zorunlu vardiya açıksa sipariş öncesi uyarı alırsınız.'],
    manual: [
      'Açılış kasası: çekmecedeki başlangıç parası.',
      'Kapanışta beklenen nakit ile sayılan nakit karşılaştırılır.',
    ],
    keywords: ['vardiya', 'shift', 'kasa aç', 'gün sonu'],
    pages: ['shifts', 'endofday'],
  },
  {
    id: 'printers',
    title: 'Yazıcılar',
    summary: 'Adisyon, mutfak ve etiket yazıcıları.',
    category: 'yonetim',
    menuPath: 'Ayarlar → Yazıcılar',
    coach:
      'Yazıcılar masaüstü (Electron) veya ağ yazıcısı ile bağlanır. Mutfak fişi ürün kategorisine göre yönlendirilebilir. Web’de yazdırma tarayıcı/yerel agent ile yapılır.',
    steps: ['Ayarlar → Yazıcılar', 'Yazıcı seç / test', 'Mutfak yönlendirmesini ayarla'],
    tips: ['Test baskısı almadan canlıya geçmeyin.'],
    manual: [
      'Adisyon yazıcısı: müşteri hesabı.',
      'Mutfak yazıcısı: hazırlık fişi; kategoriye göre farklı yazıcı seçilebilir.',
    ],
    keywords: ['yazıcı', 'fiş', 'mutfak fişi', 'printer', 'adisyon'],
    pages: ['settings'],
  },
  {
    id: 'users',
    title: 'Kullanıcılar ve yetkiler',
    summary: 'Garson, kasiyer, yönetici rolleri.',
    category: 'yonetim',
    menuPath: 'Kullanıcı yönetimi',
    coach:
      'Her personele rol verin. Garson sipariş alır, kasiyer ödeme alır, yönetici rapor ve ayar görür. PIN / telefon ile giriş desteklenir.',
    steps: ['Kullanıcı yönetimi', 'Rol seç', 'Yetkileri kontrol et'],
    tips: ['Sahip (owner) hesabını paylaşmayın; ayrı yönetici oluşturun.'],
    manual: [
      'Yetki kapalıysa ilgili buton görünmez veya hata verir.',
      'Garson uygulaması ayrı giriş ile mobil kullanım içindir.',
    ],
    keywords: ['kullanıcı', 'garson', 'yetki', 'rol', 'personel'],
    pages: ['users'],
  },
  {
    id: 'reports',
    title: 'Raporlar',
    summary: 'Satış, ürün, personel ve stok özetleri.',
    category: 'yonetim',
    menuPath: 'Raporlar',
    coach:
      'Raporlar ekranından gün/hafta/ay seçin. Ürün bazlı hangisi çok satılmış, hangi kanal (masa/paket/online) bakın. Gün sonundan önce vardiyayı kapatmayı unutmayın.',
    steps: ['Raporlar menüsü', 'Tarih aralığı', 'Dışa aktar (isteğe bağlı)'],
    tips: ['Şube filtresi çoklu şubede önemlidir.'],
    manual: [
      'Satış raporu ciroyu, ürün raporu en çok satanı gösterir.',
      'Excel/PDF dışa aktarım destekleniyorsa paylaşım için kullanın.',
    ],
    keywords: ['rapor', 'ciro', 'satış', 'report'],
    pages: ['reports'],
  },
  {
    id: 'online',
    title: 'Online siparişler',
    summary: 'Getir, Yemeksepeti ve benzeri platformlar.',
    category: 'entegrasyon',
    menuPath: 'Online Siparişler / Ayarlar → Entegrasyonlar',
    coach:
      'Entegrasyon Ayarları’ndan platform bağlanır. Gelen sipariş bildirimle düşer; kabul → hazır → kurye. Menü eşlemesi doğru olmalı.',
    steps: ['Ayarlar → Entegrasyonlar', 'API / mağaza bağla', 'Test siparişi izle'],
    tips: ['Webhook adresinin sunucuya erişilebilir olduğundan emin olun.'],
    manual: [
      'Platform menü ID’leri ŞefPOS ürünleriyle eşlenmelidir.',
      'Bildirim sesi kapalıysa sipariş kaçabilir; toast/bildirimi açık tutun.',
    ],
    keywords: ['getir', 'yemeksepeti', 'online', 'trendyol', 'entegrasyon'],
    pages: ['online-orders', 'settings'],
  },
];

const GUIDE_HIDDEN_KEY = 'shefpos_guide_hidden';
const GUIDE_OPEN_EVENT = 'sefpos-open-guide';

/** Varsayılan: yüzen Rehber FAB gizli (POS’u engellemesin). Üst menü Kılavuz ile açılır. */
export function isGuideFabHidden(): boolean {
  try {
    const v = localStorage.getItem(GUIDE_HIDDEN_KEY);
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function setGuideFabHidden(hidden: boolean): void {
  try {
    localStorage.setItem(GUIDE_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sefpos-guide-pref', { detail: { hidden } }));
  }
}

export function requestOpenGuide(tab?: 'assistant' | 'manual'): void {
  // FAB’ı geri getirme — sadece paneli aç (üst menü Kılavuz)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GUIDE_OPEN_EVENT, { detail: { tab: tab || 'manual' } }));
  }
}

export { GUIDE_OPEN_EVENT };

function normalizeTr(s: string): string {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function matchGuideArticles(query: string, limit = 4): GuideArticle[] {
  const q = normalizeTr(query).trim();
  if (!q) return GUIDE_ARTICLES.slice(0, limit);

  const scored = GUIDE_ARTICLES.map((a) => {
    let score = 0;
    const blob = normalizeTr(
      [a.title, a.summary, a.coach, ...(a.manual || []), ...a.keywords, ...a.steps].join(' '),
    );
    const tokens = q.split(/\s+/).filter((t) => t.length > 1);
    for (const t of tokens) {
      if (blob.includes(t)) score += 2;
      if (a.keywords.some((k) => normalizeTr(k).includes(t) || t.includes(normalizeTr(k)))) score += 3;
      if (normalizeTr(a.title).includes(t)) score += 4;
    }
    if (blob.includes(q)) score += 5;
    return { a, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);

  if (!scored.length) {
    return GUIDE_ARTICLES.filter((a) => a.id === 'welcome' || a.id === 'products' || a.id === 'tables').slice(
      0,
      limit,
    );
  }
  return scored.slice(0, limit).map((x) => x.a);
}

export function articleForOnboardingStep(step: number): GuideArticle | undefined {
  return GUIDE_ARTICLES.find((a) => a.onboardingStep === step) || GUIDE_ARTICLES[0];
}

export function articlesForPage(page: string | undefined | null): GuideArticle[] {
  if (!page) return [GUIDE_ARTICLES[0]];
  const hit = GUIDE_ARTICLES.filter((a) => a.pages?.includes(page));
  return hit.length ? hit : [GUIDE_ARTICLES[0], GUIDE_ARTICLES.find((a) => a.id === 'products')!].filter(Boolean);
}

export const GUIDE_STARTER_QUESTIONS = [
  'Ürün nasıl eklenir?',
  'Stok grubu nedir?',
  'Masa düzeni nasıl kurulur?',
  'Paket sipariş nasıl alınır?',
  'Vardiya nasıl açılır?',
];
