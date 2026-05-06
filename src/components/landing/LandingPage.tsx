import { useState, useEffect } from 'react';
import { Menu, X, ChefHat, ArrowRight, CheckCircle, Globe, Monitor, Smartphone, BarChart3, Users, Lock, Zap, Star, Phone, MapPin, MessageCircle, Download, Building2, TrendingUp, Award, Shield, Clock, CreditCard, Laptop, Package, Gauge, Database } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
}

export function LandingPage({ onLogin }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showResellerForm, setShowResellerForm] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [resellerNetwork, setResellerNetwork] = useState<Array<{
    id: string;
    company_name: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    city?: string;
    notes?: string;
  }>>([]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { supabase } = await import('../../lib/supabase');
        const { data: resellerData } = await supabase
          .from('resellers')
          .select('id, company_name, contact_name, phone, email, notes')
          .order('created_at', { ascending: false })
          .limit(12);

        const { data: appData } = await supabase
          .from('reseller_applications')
          .select('id, company_name, contact_name, phone, email, city, status')
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(12);

        const merged = [
          ...((resellerData || []) as any[]).map((r) => ({
            id: `r-${r.id}`,
            company_name: r.company_name,
            contact_name: r.contact_name,
            phone: r.phone,
            email: r.email,
            notes: r.notes,
          })),
          ...((appData || []) as any[]).map((a) => ({
            id: `a-${a.id}`,
            company_name: a.company_name,
            contact_name: a.contact_name,
            phone: a.phone,
            email: a.email,
            notes: a.city ? `${a.city}` : '',
          })),
        ];

        const dedup = Array.from(
          new Map(merged.map((x) => [x.company_name?.toLowerCase?.() || x.id, x])).values(),
        ).slice(0, 12);

        if (mounted) setResellerNetwork(dedup as any);
      } catch {
        if (mounted) setResellerNetwork([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const navLinks = [
    { label: 'Özellikler', id: 'features' },
    { label: 'Nasıl Çalışır', id: 'how' },
    { label: 'Fiyatlar', id: 'pricing' },
    { label: 'Bayilerimiz', id: 'reseller' },
    { label: 'İndirme', id: 'download' },
    { label: 'İletişim', id: 'contact' },
  ];

  const features = [
    {
      icon: Monitor,
      title: 'Masa Yönetimi',
      desc: 'Gerçek zamanlı masa durumu, doluluk takibi ve hızlı statü güncellemeleri',
    },
    {
      icon: ShoppingBag,
      title: 'Sipariş Yönetimi',
      desc: 'Dine-in, paket ve kurye siparişleri tek platformdan yönetin',
    },
    {
      icon: Users,
      title: 'Personel Yönetimi',
      desc: 'Garson, kasiyer, yönetici rollerinden tam kontrol sağlayın',
    },
    {
      icon: BarChart3,
      title: 'Detaylı Raporlar',
      desc: 'Satış, ürün ve personel analitiği ile veri odaklı karar alın',
    },
    {
      icon: Globe,
      title: 'Online Sipariş Entegrasyonu',
      desc: 'Getir ve Yemeksepeti siparişlerini otomatik alın',
    },
    {
      icon: Lock,
      title: 'Güvenlik & Kontrol',
      desc: 'PIN kilit, rol bazlı yetkilendirme ve tam erişim loglaması',
    },
    {
      icon: CreditCard,
      title: 'Çok Ödeme Seçeneği',
      desc: 'Nakit, kart, çek ve dijital ödeme yöntemlerini destekle',
    },
    {
      icon: Package,
      title: 'Stok Yönetimi',
      desc: 'Ürün kategorileri, varyantları ve stok takibi otomatik',
    },
    {
      icon: Database,
      title: 'Bulut Veritabanı',
      desc: 'Tüm verileriniz güvenli şekilde bulutta, anında backup',
    },
    {
      icon: Gauge,
      title: 'Performans Analiz',
      desc: 'Mutfak hızı, garson verimliliği, müşteri memnuniyeti',
    },
    {
      icon: Award,
      title: 'Müşteri Sadakat',
      desc: 'Puan sistemi, indirimler ve özel teklifler yönetimi',
    },
    {
      icon: TrendingUp,
      title: 'Satış Takibi',
      desc: 'Gerçek zamanlı satış, trending ürünler, sezonsal analiz',
    },
  ];

  const howWorks = [
    {
      num: '01',
      title: 'Bulut Tabanlı Altyapı',
      desc: 'Verileriniz Supabase güvenli sunucularında saklanır. Her cihazdan, her yerden erişebilirsiniz.',
    },
    {
      num: '02',
      title: 'Çevrimdışı Çalışma',
      desc: 'İnternet kesintisinde bile çalışmaya devam edin. Bağlantı geldiğinde otomatik senkronizasyon.',
    },
    {
      num: '03',
      title: 'Gerçek Zamanlı Senkronizasyon',
      desc: 'Tüm cihazlar anında senkronize edilir. Masanız güncellendiğinde mutfak ekranı hemen haberdar olur.',
    },
  ];

  const testimonials = [
    {
      name: 'Ahmet Yılmaz',
      business: 'Lezzet Kebap - İstanbul',
      text: 'Masa yönetimi çok kolaylaştı. Personelim 1 günde adapte oldu. Çok memnunuz.',
      rating: 5,
    },
    {
      name: 'Fatma Kaya',
      business: 'Cafe Mio - Ankara',
      text: 'Online sipariş entegrasyonu mükemmel çalışıyor. Hiç sipariş kaçırmıyoruz.',
      rating: 5,
    },
    {
      name: 'Mehmet Demir',
      business: 'Pizza Palace - İzmir',
      text: 'Raporlar çok detaylı. Hangi ürünün ne sattığını anlık görebiliyorum.',
      rating: 5,
    },
  ];

  const plans = [
    {
      name: 'Başlangıç',
      features: ['1 Şube', '3 Kullanıcı', 'Masa & Sipariş Yönetimi', 'Temel Raporlar', 'WhatsApp Destek'],
    },
    {
      name: 'Profesyonel',
      highlight: true,
      features: ['3 Şube', '10 Kullanıcı', 'Tüm Özellikler', 'Online Sipariş', 'Öncelikli Destek'],
    },
    {
      name: 'Kurumsal',
      features: ['Sınırsız Şube', 'Sınırsız Kullanıcı', 'API Erişimi', '7/24 Destek', 'SLA Garantisi'],
    },
  ];

  const downloadCards = [
    {
      icon: Laptop,
      title: 'Windows',
      desc: 'En çok tercih edilen POS sistemi',
      size: '245 MB',
      version: 'v1.2.5',
      action: 'SEFPOS Setup (Yakında)',
      disabled: true,
      onClick: () => {},
    },
    {
      icon: Globe,
      title: 'Web Uygulaması',
      desc: 'Tarayıcıdan kullanın, yüklemeye gerek yok',
      size: 'Yükleme Yok',
      version: 'Güncel',
      action: 'Başla',
      onClick: () => onLogin(),
    },
    {
      icon: Smartphone,
      title: 'Mobil Kurye',
      desc: 'Kurye ekranını webden açın',
      size: 'Hızlı Erişim',
      version: 'v1.0.2',
      action: 'Kurye Aç',
      onClick: () => {
        const url = new URL(window.location.href);
        url.searchParams.set('courier', '1');
        window.location.href = url.toString();
      },
    },
  ] as const;

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2.5"
              aria-label="Ana sayfaya dön"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <ChefHat className="w-5 h-5 text-white" />
              </div>
              <span className={`text-xl font-bold tracking-tight ${scrolled ? 'text-slate-900' : 'text-white'}`}>
                ŞefPOS
              </span>
            </button>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map(item => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`text-sm font-medium transition-colors ${
                    scrolled
                      ? 'text-slate-600 hover:text-orange-600'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={onLogin}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                Giriş Yap
              </button>
              <button
                onClick={() => scrollTo('reseller')}
                className={`font-semibold px-6 py-2.5 rounded-lg transition-colors border ${
                  scrolled
                    ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                    : 'border-white/30 text-white hover:bg-white/10'
                }`}
              >
                Bayimiz Olun
              </button>
            </div>

            <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? (
                <X className={`w-6 h-6 ${scrolled ? 'text-slate-900' : 'text-white'}`} />
              ) : (
                <Menu className={`w-6 h-6 ${scrolled ? 'text-slate-900' : 'text-white'}`} />
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white border-b border-slate-100">
            <div className="px-4 py-4 space-y-2">
              {navLinks.map(item => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className="block w-full text-left text-slate-700 font-medium py-2.5 px-3 rounded-lg hover:bg-slate-100 text-sm"
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={onLogin}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg mt-2"
              >
                Giriş Yap
              </button>
              <button
                onClick={() => scrollTo('reseller')}
                className="w-full border border-orange-200 text-orange-600 font-semibold py-3 rounded-lg mt-2 hover:bg-orange-50"
              >
                Bayimiz Olun
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 flex items-center overflow-hidden pt-16">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <Zap className="w-3.5 h-3.5" />
              Türkiye'nin Yerli Bulut POS Sistemi
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-6">
              Restoranınızı
              <br />
              <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                Profesyonelce Yönetin
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-10 max-w-2xl">
              Masa yönetiminden kurye takibine, online siparişlerden raporlamaya kadar tüm restoran operasyonlarını tek platformda kontrol edin.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-8 py-4 rounded-lg transition-colors text-lg"
              >
                Ücretsiz Dene
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => scrollTo('features')}
                className="inline-flex items-center justify-center gap-2 border-2 border-white/20 hover:border-white/40 text-white font-semibold px-8 py-4 rounded-lg transition-colors"
              >
                Özellikleri Keşfet
              </button>
            </div>

            <div className="flex items-center gap-8 mt-16 flex-wrap">
              {[
                { val: '500+', label: 'Aktif Restoran' },
                { val: '99.9%', label: 'Uptime' },
                { val: '81', label: "İl'de Aktif" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl font-bold text-white">{s.val}</div>
                  <div className="text-sm text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
            </div>

            {/* Right side - Full POS Dashboard */}
            <div className="hidden lg:flex items-center justify-end relative w-full pr-0">
              <div className="flex flex-col items-center">
                <div className="bg-white rounded-xl shadow-2xl border-8 border-slate-900 overflow-hidden" style={{ width: '580px', height: '440px' }}>
                  <FullPOSDashboard />
                </div>
                <div className="w-64 h-3 bg-slate-900 rounded-b-2xl mt-2 shadow-lg" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">
              Güçlü Özellikler
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Küçük kafelerden büyük restoran zincirlerine kadar herkese uygun
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="group p-8 border border-slate-200 rounded-2xl hover:shadow-lg transition-all duration-300 hover:border-orange-300 bg-slate-50/50 hover:bg-white">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-6 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                    <Icon className="w-6 h-6 text-orange-600 group-hover:text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">{f.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-24 md:py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">
              Nasıl Çalışır
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Basit, etkili ve güvenli
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {howWorks.map((item, i) => (
              <div key={i} className="relative">
                {i < howWorks.length - 1 && (
                  <div className="hidden md:block absolute top-16 left-full w-8 h-0.5 bg-gradient-to-r from-orange-300 to-transparent" />
                )}
                <div className="bg-white rounded-2xl p-8 border border-slate-200 relative z-10">
                  <div className="w-12 h-12 bg-orange-600 text-white rounded-lg flex items-center justify-center font-black text-lg mb-4">
                    {item.num}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">
              Müşterilerimiz Neler Diyor
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl p-8 border border-slate-200">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed mb-6">"{t.text}"</p>
                <div className="pt-6 border-t border-slate-200">
                  <div className="font-bold text-slate-900">{t.name}</div>
                  <div className="text-sm text-slate-500">{t.business}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 md:py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">Paketler</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Size uygun paket için arayınız. Tüm planlarda 14 gün ücretsiz deneme bulunur.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 transition-all ${
                  plan.highlight
                    ? 'bg-orange-600 text-white shadow-2xl relative'
                    : 'bg-white border border-slate-200'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                    En Popüler
                  </div>
                )}
                <h3 className={`text-2xl font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                  {plan.name}
                </h3>
                <div className="mb-8">
                  <span className={`text-lg font-black ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                    Fiyat için arayınız
                  </span>
                </div>
                <ul className={`space-y-3 mb-8 ${plan.highlight ? 'text-white/90' : 'text-slate-600'}`}>
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => scrollTo('contact')}
                  className={`w-full py-3 rounded-lg font-bold transition-colors ${
                    plan.highlight
                      ? 'bg-white text-orange-600 hover:bg-orange-50'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  Bizi Arayın
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-24 md:py-32 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Hemen İndirin
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Kurulumu yapın, 14 gün ücretsiz kullanın. İnternet bağlantısı olmasa da çalışır.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {downloadCards.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center hover:border-orange-400 transition-all">
                  <div className="w-16 h-16 bg-orange-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-slate-400 mb-6">{item.desc}</p>
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Boyut:</span>
                      <span className="text-white font-bold">{item.size}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Versiyon:</span>
                      <span className="text-white font-bold">{item.version}</span>
                    </div>
                  </div>
                  <button
                    onClick={item.onClick}
                    disabled={(item as any).disabled}
                    className={`w-full font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                      (item as any).disabled
                        ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    {item.action}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-16 bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold text-white mb-4">Sistem Gereksinimleri</h3>
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div className="text-slate-300">
                <p className="font-bold text-orange-400 mb-2">Windows</p>
                <ul className="space-y-1">
                  <li>• Windows 7 ve üzeri</li>
                  <li>• 4 GB RAM (önerilir 8 GB)</li>
                  <li>• 500 MB boş disk alanı</li>
                  <li>• .NET Framework 4.7+</li>
                </ul>
              </div>
              <div className="text-slate-300">
                <p className="font-bold text-orange-400 mb-2">Web Uygulaması</p>
                <ul className="space-y-1">
                  <li>• Chrome, Firefox, Safari</li>
                  <li>• İnternet bağlantısı (periyodik)</li>
                  <li>• Çevrimdışı çalışmayı destekler</li>
                  <li>• Tüm cihazlarda uyumlu</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reseller Program */}
      <section id="reseller" className="py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">
              Bayımız Olur Musunuz?
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Restoranları ŞefPOS ile tanıştırın, her sattığınız lisans başına kazanç sağlayın
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              {
                title: 'Başlangıç Bayi',
                commission: '%15',
                volume: '0-10 Lisans',
                benefits: [
                  'Peş peşe ödeme',
                  'Eğitim desteği',
                  'Marketing materyalleri',
                  'Teknik destek',
                  'Bölgesel tanıtım',
                ],
              },
              {
                title: 'Profesyonel Bayi',
                commission: '%20',
                volume: '11-50 Lisans',
                benefits: [
                  'Haftalık ödeme',
                  'Özel eğitim programı',
                  'Reklam fonları',
                  'Öncelikli teknik destek',
                  'Marka ortaklığı',
                  'Ek bölgeler',
                ],
                highlight: true,
              },
              {
                title: 'Kurumsal Bayi',
                commission: '%25',
                volume: '50+ Lisans',
                benefits: [
                  'Günlük ödeme',
                  'Kişisel hesap yöneticisi',
                  'Tam pazarlama desteği',
                  '7/24 Teknik destek',
                  'Eksklusif bölgeler',
                  'API erişimi',
                  'Custom geliştirmeler',
                ],
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 border-2 transition-all ${
                  plan.highlight
                    ? 'border-orange-500 bg-orange-50 shadow-xl'
                    : 'border-slate-200 bg-white hover:border-orange-300'
                }`}
              >
                {plan.highlight && (
                  <div className="inline-block bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
                    En Popüler
                  </div>
                )}
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.title}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-black text-orange-600">{plan.commission}</span>
                  <span className="text-slate-600 ml-2">Komisyon</span>
                  <p className="text-sm text-slate-500 mt-2">{plan.volume}</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.benefits.map((b, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm">
                      <CheckCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700">{b}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setShowResellerForm(true)}
                  className={`w-full py-3 rounded-lg font-bold transition-colors ${
                  plan.highlight
                    ? 'bg-orange-600 text-white hover:bg-orange-700'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                }`}>
                  Başvur
                </button>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-12">
            <h3 className="text-2xl font-bold text-slate-900 mb-8">Neden ŞefPOS Bayi Olmalısınız?</h3>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                {
                  icon: TrendingUp,
                  title: 'Yüksek Kar Marjı',
                  desc: 'Sektördeki en yüksek bayı komisyonları ve bonus fırsatları',
                },
                {
                  icon: Users,
                  title: 'Tam Destek',
                  desc: 'Müşteri kazanımından implementasyona kadar tüm sürece yardım',
                },
                {
                  icon: Award,
                  title: 'Marka Güveni',
                  desc: '500+ restoran tarafından kullanılan, 99.9% uptime garantili sistem',
                },
                {
                  icon: Building2,
                  title: 'Bölgesel Haklar',
                  desc: 'Kendi bölgenizde özel pazarlama ve satış hakları',
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex gap-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 mb-1">{item.title}</h4>
                      <p className="text-slate-600 text-sm">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 bg-white border-2 border-slate-200 rounded-2xl p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Bayilerimiz Türkiye Ağı</h3>
                <p className="text-slate-600 text-sm">Aktif bayilerimizin iletişim bilgilerini ve bölgesel dağılımını inceleyin.</p>
              </div>
              {resellerNetwork.length > 0 && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 text-xs font-bold border border-orange-200">
                  {resellerNetwork.length} aktif bayi
                </span>
              )}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-orange-50 min-h-[320px] p-4 overflow-hidden">
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <svg viewBox="0 0 800 380" className="w-full h-full">
                    <path d="M29 176l34-33 46-6 38 11 41-23 50 4 39-21 63 19 46-11 49 18 46-8 58 24 32 31-24 33-37 12-55 0-39 17-48 0-61-13-55 16-58-13-42 14-59-11-42-34z" fill="#94a3b8" />
                  </svg>
                </div>
                {resellerNetwork.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500 font-medium">
                    Bayi harita görünümü için aktif bayi kaydı bekleniyor.
                  </div>
                ) : (
                  resellerNetwork.map((r, i) => {
                    const points = [
                      { x: 16, y: 40 }, { x: 26, y: 34 }, { x: 34, y: 46 }, { x: 44, y: 39 },
                      { x: 54, y: 47 }, { x: 62, y: 42 }, { x: 70, y: 50 }, { x: 22, y: 56 },
                      { x: 31, y: 62 }, { x: 48, y: 60 }, { x: 60, y: 58 }, { x: 74, y: 62 },
                    ];
                    const p = points[i % points.length];
                    return (
                      <div
                        key={r.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        title={r.company_name}
                      >
                        <div className="w-3.5 h-3.5 rounded-full bg-orange-600 ring-2 ring-orange-200 animate-pulse" />
                        <div className="absolute mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">
                          {r.company_name}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {resellerNetwork.length === 0 ? (
                  <div className="h-full min-h-[320px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
                    Aktif bayi listesi bulunamadı.
                  </div>
                ) : resellerNetwork.map((r) => (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <p className="font-bold text-slate-900">{r.company_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.contact_name || 'Yetkili'} {r.phone ? `• ${r.phone}` : ''}</p>
                    <p className="text-xs text-slate-500">{r.email || 'E-posta bilgisi yok'}</p>
                    <p className="text-xs text-slate-600 mt-1">{r.notes || 'Adres bilgisi bayi tarafından paylaşılacaktır.'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-24 md:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">
              Bizimle İletişime Geçin
            </h2>
            <p className="text-xl text-slate-600">
              Sorularınız için her zaman yanınızdayız
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: MessageCircle,
                label: 'WhatsApp',
                value: '0544 244 90 80',
                href: 'https://wa.me/905442449080',
              },
              {
                icon: Phone,
                label: 'Telefon',
                value: '0236 320 04 45',
                href: 'tel:02363200445',
              },
              {
                icon: MapPin,
                label: 'Adres',
                value: 'Turgutlu, Manisa',
                href: '#',
              },
              {
                icon: Clock,
                label: 'Saatler',
                value: '7/24 Online',
                href: '#',
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <a
                  key={i}
                  href={item.href}
                  className="p-6 border border-slate-200 rounded-2xl hover:shadow-lg hover:border-orange-300 transition-all bg-slate-50 hover:bg-white text-center group"
                >
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5 text-orange-600 group-hover:text-white" />
                  </div>
                  <div className="text-slate-500 text-sm font-medium">{item.label}</div>
                  <div className="text-slate-900 font-bold">{item.value}</div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28 bg-orange-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
            Hemen Başlamaya Hazır Mısınız?
          </h2>
          <p className="text-lg text-orange-100 mb-8 max-w-2xl mx-auto">
            14 gün ücretsiz deneyin. Kredi kartı gerekmez. İstediğiniz zaman iptal edin.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onLogin}
              className="inline-flex items-center justify-center gap-2 bg-white text-orange-600 hover:bg-orange-50 font-bold px-10 py-4 rounded-lg transition-colors text-lg"
            >
              Ücretsiz Deneyin
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDemo(true)}
              className="inline-flex items-center justify-center gap-2 border-2 border-white text-white hover:bg-orange-700 font-bold px-10 py-4 rounded-lg transition-colors text-lg"
            >
              Demo Gör
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Reseller Form Modal */}
      {showResellerForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <ResellerForm onClose={() => setShowResellerForm(false)} />
        </div>
      )}

      {/* Demo Modal */}
      {showDemo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold text-slate-900 mb-4">Demo Sisteme Giriş</h3>
            <p className="text-slate-600 mb-6">
              Sistemi güvenli ortamda deneyim. Hiçbir veri kaydedilmez.
            </p>
            <div className="space-y-4 mb-6 p-4 bg-slate-50 rounded-lg text-sm text-slate-700">
              <div>
                <p className="font-semibold text-slate-900">Kullanıcı: demo@shefpos.local</p>
                <p className="font-semibold text-slate-900">Şifre: demo1234</p>
              </div>
            </div>
            <button
              onClick={() => {
                window.location.href = '/?demo=true';
              }}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg transition-colors mb-2"
            >
              Demo'yu Başlat
            </button>
            <button
              onClick={() => setShowDemo(false)}
              className="w-full border border-slate-300 text-slate-900 font-bold py-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold">ŞefPOS</span>
            </div>
            <div className="flex gap-4">
              <a href="https://wa.me/905442449080" className="hover:text-orange-400 transition-colors">
                <MessageCircle className="w-5 h-5" />
              </a>
              <a href="tel:02363200445" className="hover:text-orange-400 transition-colors">
                <Phone className="w-5 h-5" />
              </a>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">&copy; 2024 ŞefPOS. Tüm hakları saklıdır.</p>
            <div className="flex gap-6 text-sm">
              <a href="#" className="hover:text-orange-400 transition-colors">
                Gizlilik Politikası
              </a>
              <a href="#" className="hover:text-orange-400 transition-colors">
                Kullanım Koşulları
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Full POS Dashboard with all features
function FullPOSDashboard() {
  const tables = [
    { id: 1, occupied: false },
    { id: 2, occupied: true, amount: 285 },
    { id: 3, occupied: true, amount: 420 },
    { id: 4, occupied: false },
    { id: 5, occupied: true, amount: 580 },
    { id: 6, occupied: true, amount: 320 },
  ];

  const orders = [
    { id: '001', table: 2, items: 'Biftek + Salata', status: 'Hazırlanıyor', time: '8dk' },
    { id: '002', table: 5, items: 'Pizza + İçecek', status: 'Tamamlandı', time: '5dk' },
    { id: '003', table: 3, items: 'Pasta + Tatlı', status: 'Bekliyor', time: '2dk' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">ŞefPOS</h1>
            <p className="text-orange-100 text-xs">19:45</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">₺5.840</p>
            <p className="text-orange-100 text-xs">Ciro</p>
          </div>
        </div>
      </div>

      {/* Main Content - 3 Column Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Masa Yönetimi */}
        <div className="w-1/3 border-r border-slate-700 overflow-y-auto p-2.5 bg-slate-800">
          <h3 className="text-xs font-bold mb-2.5 text-orange-400">MASALAR (4/6)</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {tables.map((t) => (
              <div
                key={t.id}
                className={`rounded p-1.5 text-center cursor-pointer transition-all text-xs ${
                  t.occupied
                    ? 'bg-orange-600 shadow-lg'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                <p className="font-bold">M{t.id}</p>
                {t.occupied && <p className="text-orange-100 text-xs mt-0.5">₺{t.amount}</p>}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="bg-slate-700 rounded p-1.5">
              <p className="text-slate-400 text-xs">Bekleme</p>
              <p className="font-bold">8.5 dk</p>
            </div>
            <div className="bg-slate-700 rounded p-1.5">
              <p className="text-slate-400 text-xs">Ort. Sipariş</p>
              <p className="font-bold">₺315</p>
            </div>
          </div>

          {/* Stock Status */}
          <div className="mt-3">
            <h3 className="text-xs font-bold mb-1.5 text-orange-400">STOK</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Biftek</span>
                <span className="text-green-400 font-bold">12/15</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Tavuk</span>
                <span className="text-yellow-400 font-bold">4/20</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Baharat</span>
                <span className="text-red-400 font-bold">1/10</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Siparişler & Mutfak */}
        <div className="w-1/3 border-r border-slate-700 overflow-y-auto p-2.5 bg-slate-800">
          <h3 className="text-xs font-bold mb-2.5 text-orange-400">MUTFAK (3)</h3>
          <div className="space-y-1.5">
            {orders.map((order) => (
              <div key={order.id} className={`rounded p-1.5 text-xs border-l-3 ${
                order.status === 'Hazırlanıyor' ? 'bg-blue-900 border-blue-500' :
                order.status === 'Tamamlandı' ? 'bg-green-900 border-green-500' :
                'bg-yellow-900 border-yellow-500'
              }`}>
                <div className="flex justify-between items-start mb-0.5 gap-1">
                  <span className="font-bold">M{order.table}</span>
                  <span className={`px-1 py-0 rounded text-xs whitespace-nowrap ${
                    order.status === 'Hazırlanıyor' ? 'bg-blue-600' :
                    order.status === 'Tamamlandı' ? 'bg-green-600' :
                    'bg-yellow-600'
                  }`}>{order.status === 'Hazırlanıyor' ? 'Hazır.' : order.status === 'Tamamlandı' ? 'Tamam' : 'Bekle'}</span>
                </div>
                <p className="text-slate-300 text-xs">{order.items}</p>
                <p className="text-slate-400 text-xs">{order.time}</p>
              </div>
            ))}
          </div>

          {/* Payment Status */}
          <h3 className="text-xs font-bold mt-3 mb-1.5 text-orange-400">ÖDEMELER</h3>
          <div className="space-y-1 text-xs">
            <div className="bg-slate-700 rounded p-1.5 flex justify-between items-center">
              <span className="text-slate-300">Nakit</span>
              <span className="text-green-400 font-bold">₺2.4K</span>
            </div>
            <div className="bg-slate-700 rounded p-1.5 flex justify-between items-center">
              <span className="text-slate-300">Kart</span>
              <span className="text-blue-400 font-bold">₺1.8K</span>
            </div>
            <div className="bg-slate-700 rounded p-1.5 flex justify-between items-center">
              <span className="text-slate-300">Hızlı</span>
              <span className="text-purple-400 font-bold">₺1.5K</span>
            </div>
          </div>
        </div>

        {/* Right: Personel & Uyarılar */}
        <div className="w-1/3 overflow-y-auto p-2.5 bg-slate-800">
          <h3 className="text-xs font-bold mb-2 text-orange-400">PERSONEL</h3>
          <div className="space-y-1 text-xs mb-3">
            {[
              { name: 'Ayşe', role: 'Garson', active: true },
              { name: 'Mehmet', role: 'Kasiyer', active: true },
              { name: 'Fatma', role: 'Mutfak', active: true },
            ].map((staff, i) => (
              <div key={i} className="flex items-center justify-between p-1.5 bg-slate-700 rounded">
                <div>
                  <p className="font-bold text-xs">{staff.name}</p>
                  <p className="text-slate-400 text-xs">{staff.role}</p>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full ${staff.active ? 'bg-green-500' : 'bg-slate-500'}`} />
              </div>
            ))}
          </div>

          {/* Alerts */}
          <h3 className="text-xs font-bold mb-1.5 text-red-400">UYARILAR</h3>
          <div className="space-y-1">
            <div className="bg-red-900 border border-red-700 rounded p-1.5 text-xs">
              <p className="font-bold text-red-200">Baharat Azalıyor</p>
              <p className="text-red-300 text-xs">1 adet</p>
            </div>
            <div className="bg-yellow-900 border border-yellow-700 rounded p-1.5 text-xs">
              <p className="font-bold text-yellow-200">M2 Beklemede</p>
              <p className="text-yellow-300 text-xs">8 dk</p>
            </div>
          </div>

          {/* Quick Actions */}
          <h3 className="text-xs font-bold mt-3 mb-1.5 text-orange-400">İŞLEM</h3>
          <div className="space-y-0.5">
            <button className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-1 rounded text-xs">
              Gün Sonu
            </button>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-1 rounded text-xs">
              Kasa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ShoppingBag icon fallback
function ShoppingBag(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function ResellerForm({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    company: '',
    name: '',
    phone: '',
    email: '',
    city: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { supabase } = await import('../../lib/supabase');

      const payload: Record<string, any> = {
        company_name: formData.company,
        contact_name: formData.name,
        phone: formData.phone,
        email: formData.email,
        status: 'pending',
      };

      // Some deployments may not include optional columns like city/message yet.
      payload.city = formData.city;
      const first = await supabase.from('reseller_applications').insert([payload]);
      if (first.error && first.error.message?.toLowerCase().includes('city')) {
        delete payload.city;
        const retry = await supabase.from('reseller_applications').insert([payload]);
        if (retry.error) throw retry.error;
      } else if (first.error) {
        throw first.error;
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      alert('Hata: ' + (err.message || 'Bir hata oluştu'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">Başvurunuz Alındı!</h3>
        <p className="text-slate-600">
          En kısa sürede sizinle iletişime geçeceğiz.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
      <button
        onClick={onClose}
        className="float-right text-slate-400 hover:text-slate-600"
      >
        <X className="w-6 h-6" />
      </button>

      <h3 className="text-2xl font-bold text-slate-900 mb-2">Bayi Başvurusu</h3>
      <p className="text-slate-600 text-sm mb-6">
        Aşağıdaki formu doldurarak bayi başvurusunda bulunabilirsiniz.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Şirket Adı
          </label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => setFormData({...formData, company: e.target.value})}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            placeholder="Şirketinizin adı"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            İsim Soyisim
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            placeholder="İsminiz"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Telefon
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            placeholder="0532 123 45 67"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            E-mail
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Şehir
          </label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => setFormData({...formData, city: e.target.value})}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            placeholder="İstanbul"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors mt-6"
        >
          {loading ? 'Gönderiliyor...' : 'Başvuruyu Gönder'}
        </button>
      </form>
    </div>
  );
}
