import {
  ArrowRight,
  Check,
  X,
  Download,
  Star,
  ChevronRight,
  Store,
  Headphones,
  Monitor,
  Package,
  Globe,
  Wallet,
  Printer,
  BarChart3,
  Bike,
  Shield,
  PhoneIncoming,
  Zap,
  Users,
  QrCode,
  Bell,
  Scale,
} from 'lucide-react';
import type { LandingPageProps } from '../pages/LandingPages';
import {
  SITE,
  COMPARISON_ROWS,
  TESTIMONIALS,
  PRICING_PLANS,
  FAQ_ITEMS,
  HERO_STATS,
  WORKFLOW_STEPS,
} from '../content/siteContent';
import {
  onWindowsSetupDownloadClick,
  windowsSetupDownloadHref,
} from '../../../lib/desktopDownload';
import { TURKEY_STATS } from '../content/turkeyLocations.generated';
import { HeroDashboard } from '../components/HeroDashboard';
import { IntegrationMarquee } from '../components/IntegrationMarquee';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';
import { PricingPlanCard } from '../components/PricingPlanCard';

/* ─── Hero pillars ─────────────────────────────────────── */
const HERO_PILLARS = [
  { icon: Monitor, label: 'Salon & Adisyon',    desc: 'Masa haritası, garson ve mutfak fişi' },
  { icon: Package, label: 'Paket Servis',        desc: 'Caller ID, teslimat ve kurye takibi' },
  { icon: Globe,   label: 'Online Siparişler',   desc: 'Getir · Yemeksepeti · Trendyol' },
] as const;

/* ─── Core features (ikonlu + tam açıklama) ────────────── */
const FEATURES = [
  {
    icon: Monitor,
    tag: 'Salon',
    title: 'Masa & Salon Yönetimi',
    desc: 'Gerçek zamanlı masa haritası, açık adisyon takibi, masa birleştirme ve transfer. Garson ataması ile hangi masa dolu, ne kadar süredir açık — tek bakışta.',
    color: 'from-orange-500 to-orange-600',
  },
  {
    icon: PhoneIncoming,
    tag: 'Paket',
    title: 'Paket Servis & Caller ID',
    desc: 'Telefon çalınca müşteri otomatik tanınır. Kayıtlı adres, sipariş geçmişi ve hızlı sipariş formu tek ekranda. Kurye atama ve teslimat takibi dahil.',
    color: 'from-rose-500 to-red-600',
  },
  {
    icon: Globe,
    tag: 'Online',
    title: 'Online Sipariş Merkezi',
    desc: 'Getir, Yemeksepeti, Trendyol, Migros ve HemenYolda siparişleri tek panelde birleşir. Onay, mutfak fişi ve kurye akışı otomatik çalışır.',
    color: 'from-purple-500 to-purple-700',
  },
  {
    icon: Wallet,
    tag: 'Kasa',
    title: 'Kasa & Ödeme',
    desc: 'Nakit, kredi kartı, parçalı ödeme, açık hesap ve sadakat puanı. Vardiya açılış-kapanış ve gün sonu raporu. Hızlı satış modu ile tek ekranda işlem.',
    color: 'from-green-500 to-emerald-600',
  },
  {
    icon: Printer,
    tag: 'Mutfak',
    title: 'Mutfak & Yazıcı',
    desc: 'Kategori bazlı yazıcı yönlendirme. Adisyon, mutfak ve bar fişi siparişle birlikte otomatik çıkar. Birden fazla yazıcı bölge destekli.',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: BarChart3,
    tag: 'Rapor',
    title: 'Raporlar & Gün Sonu',
    desc: 'Şube bazlı satış analizi, iptal logları, vardiya kapanışı ve ürün bazlı sayım raporları. Her akşam net kapanış, sıfır soru işareti.',
    color: 'from-blue-500 to-blue-700',
  },
  {
    icon: Bike,
    tag: 'Kurye',
    title: 'Kurye & Teslimat',
    desc: 'Kurye atama, canlı durum takibi, müşteri adresi ve teslimat fişi. Kurye mobil ekranı ile tam senkron çalışır.',
    color: 'from-teal-500 to-cyan-600',
  },
  {
    icon: QrCode,
    tag: 'QR Menü',
    title: 'QR Menü & Garson Çağrı',
    desc: 'Masadan QR ile dijital menü. Müşteri sipariş talebini ve garson çağrısını doğrudan POS ekranına iletir. Kağıt menü yok.',
    color: 'from-indigo-500 to-indigo-700',
  },
  {
    icon: Shield,
    tag: 'Güvenlik',
    title: 'Yetki & Güvenlik',
    desc: 'Garson, kasiyer, mutfak ve yönetici rolleri. PIN kilidi, cihaz bağlama ve kiracı izolasyonu. Lisans panelinden anlık denetim.',
    color: 'from-slate-600 to-slate-800',
  },
] as const;

/* ─── Trust marquee rows ────────────────────────────────── */
const TRUST_ROW_1 = [
  { icon: Store,      text: '500+ Aktif İşletme' },
  { icon: Monitor,    text: 'Masa & Salon Yönetimi' },
  { icon: Package,    text: 'Paket Servis & Caller ID' },
  { icon: Globe,      text: 'Getir Entegrasyonu' },
  { icon: Globe,      text: 'Yemeksepeti Entegrasyonu' },
  { icon: Globe,      text: 'Trendyol Entegrasyonu' },
  { icon: Globe,      text: 'Migros Entegrasyonu' },
  { icon: Printer,    text: 'Mutfak Yazıcısı' },
  { icon: Wallet,     text: 'Nakit & Kart Ödeme' },
  { icon: BarChart3,  text: 'Gün Sonu Raporları' },
] as const;

const TRUST_ROW_2 = [
  { icon: Shield,     text: 'Türkçe Teknik Destek' },
  { icon: Zap,        text: 'Otomatik Güncellemeler' },
  { icon: Bike,       text: 'Kurye Takibi' },
  { icon: QrCode,     text: 'QR Menü & Garson Çağrı' },
  { icon: Users,      text: 'Çok Şubeli Yönetim' },
  { icon: Bell,       text: '99,9% Bulut Uptime' },
  { icon: Wallet,     text: 'Sadakat Puanı' },
  { icon: Scale,      text: 'Stok & Sayım' },
  { icon: Monitor,    text: 'Bulut + Çevrimdışı Mod' },
  { icon: Headphones, text: '7/24 Destek Hattı' },
] as const;

/* ─── Stats bar ─────────────────────────────────────────── */
const WHY_ITEMS = [
  { icon: Zap,        value: '< 3 sn',  label: 'Ortalama sipariş girişi' },
  { icon: Users,      value: '500+',    label: 'Aktif işletme' },
  { icon: Bell,       value: '99,9%',   label: 'Bulut uptime' },
  { icon: Headphones, value: '7/24',    label: 'Türkçe teknik destek' },
] as const;

export function HomeRichPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden landing-hero-bg">
        <div className="absolute inset-0 landing-hero-glow" aria-hidden />
        {/* subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16 md:pt-20 md:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* — Sol: Kopya — */}
            <div className="landing-hero-copy max-w-xl">
              {/* Eyebrow */}
              <div className="landing-hero-eyebrow">
                ŞefPOS &mdash; Restoran POS &amp; Adisyon
              </div>

              {/* Başlık */}
              <h1 className="landing-hero-title">
                Tüm operasyonunuz
                <span className="block landing-hero-title-accent">tek platformda.</span>
              </h1>

              {/* Alt başlık */}
              <p className="landing-hero-lead">
                Salon adisyonundan paket teslimatına, online siparişten gün sonu kapanışına &mdash;
                işletmenizin tüm akışı tek ekrandan, gerçek zamanlı yönetilir.
              </p>

              {/* Pillar kartlar */}
              <ul className="landing-hero-pillars">
                {HERO_PILLARS.map(({ icon: Icon, label, desc }) => (
                  <li key={label} className="landing-hero-pillar">
                    <span className="landing-hero-pillar-icon" aria-hidden>
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </span>
                    <span>
                      <span className="landing-hero-pillar-label">{label}</span>
                      <span className="landing-hero-pillar-desc">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="landing-hero-cta">
                <button
                  type="button"
                  onClick={onLogin}
                  className="landing-btn-primary landing-hero-cta-primary"
                >
                  Ücretsiz Dene <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href={windowsSetupDownloadHref()}
                  onClick={onWindowsSetupDownloadClick}
                  className="landing-btn-outline landing-hero-cta-secondary"
                >
                  <Download className="w-5 h-5" /> Windows İndir
                </a>
              </div>

              {/* Stat çubukları */}
              <div className="landing-hero-stats">
                {HERO_STATS.slice(0, 3).map((s) => (
                  <div key={s.label} className="landing-hero-stat">
                    <p className="landing-hero-stat-value">{s.value}</p>
                    <p className="landing-hero-stat-label">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* — Sağ: Dashboard mockup — */}
            <div className="relative lg:pl-4">
              {/* glow halo */}
              <div
                className="absolute -inset-4 rounded-2xl opacity-30 blur-2xl"
                style={{ background: 'radial-gradient(ellipse at center, #f97316 0%, transparent 70%)' }}
                aria-hidden
              />
              <div className="relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/50"
                style={{ aspectRatio: '16/11' }}>
                <HeroDashboard />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          GÜVEN ŞERİDİ — kurumsal chip bar
      ══════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-white via-slate-50 to-white border-y border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm">
                <Shield className="w-4 h-4 text-orange-500" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Kurumsal Güven</span>
              </span>

              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                <Store className="w-4 h-4 text-orange-500" />
                <span className="text-[11px] font-semibold">500+ İşletme</span>
              </span>

              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                <Headphones className="w-4 h-4 text-orange-500" />
                <span className="text-[11px] font-semibold">Türkçe Teknik Destek</span>
              </span>

              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-[11px] font-semibold">Otomatik güncellemeler</span>
              </span>

              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                <Bell className="w-4 h-4 text-orange-500" />
                <span className="text-[11px] font-semibold">99,9% Bulut Uptime</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                <Globe className="w-4 h-4 text-orange-500" />
                <span className="text-[11px] font-semibold">
                  Getir · Yemeksepeti · Trendyol · Migros · HemenYolda
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          NEDEN ŞEFPOS — 4 metric
      ══════════════════════════════════════════ */}
      <section className="py-16 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {WHY_ITEMS.map(({ icon: Icon, value, label }) => (
              <div key={label} className="text-center p-6 rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/80 hover:border-orange-200 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mx-auto mb-4 shadow-md shadow-orange-200">
                  <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
                <p className="text-sm text-slate-500 mt-1 leading-snug">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ÖZELLİKLER — ikonlu kart grid
      ══════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionHeading
            eyebrow="Tam Özellik Seti"
            title="Her ihtiyacınız için bir modül"
            subtitle="Salon masasından online siparişe, kasadan mutfağa — ŞefPOS işletmenizin tüm operasyonunu tek çatı altında toplar."
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, tag, title, desc, color }) => (
              <article
                key={title}
                className="group relative bg-white rounded-2xl border border-slate-200 p-6 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-100/50 transition-all duration-300 overflow-hidden"
              >
                {/* top accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${color} opacity-0 group-hover:opacity-100 transition-opacity`} />

                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0 shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">{tag}</span>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">{title}</h3>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed mt-4">{desc}</p>

                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-orange-500 group-hover:gap-2.5 transition-all">
                  <Check className="w-3.5 h-3.5" /> Dahil
                </div>
              </article>
            ))}
          </div>

          <div className="text-center mt-12">
            <button
              type="button"
              onClick={() => onNavigate('/ozellikler')}
              className="landing-btn-primary inline-flex"
            >
              Tüm özellikleri incele <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          NASIL ÇALIŞIR
      ══════════════════════════════════════════ */}
      <section className="py-20 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionHeading
            eyebrow="Nasıl Çalışır?"
            title="Siparişten rapora 4 adım"
            subtitle="Personel eğitimi kolay; ekranlar Türkçe ve yoğun saate dayanıklı."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WORKFLOW_STEPS.map((w, i) => (
              <article key={w.step} className="relative bg-slate-50 rounded-2xl border border-slate-200 p-6 hover:border-orange-200 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white text-sm font-extrabold flex items-center justify-center shadow">
                    {i + 1}
                  </span>
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">{w.step}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{w.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{w.desc}</p>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-orange-300 z-10" />
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          ENTEGRASYON
      ══════════════════════════════════════════ */}
      <section className="py-20 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionHeading
            eyebrow="Platform Entegrasyonları"
            title="Online siparişler tek merkezde"
            subtitle="Getir, Yemeksepeti, Trendyol, Migros ve HemenYolda siparişleri aynı panelde — onay, fiş, mutfak, kurye."
          />
          <IntegrationMarquee />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          KARŞILAŞTIRMA
      ══════════════════════════════════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <SectionHeading
            eyebrow="Karşılaştırma"
            title="Genel yazılımlara göre farkımız"
            subtitle="Restoran odaklı mı, genel amaçlı mı? Fark açık."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-orange-500 to-red-600 text-white">
                  <th className="text-left px-5 py-4 font-semibold">Özellik</th>
                  <th className="px-5 py-4 font-bold text-center">ŞefPOS</th>
                  <th className="px-5 py-4 font-medium text-center text-orange-100">Genel Çözüm</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-5 py-3.5 font-medium text-slate-700 text-sm">{row.label}</td>
                    <td className="px-5 py-3.5 text-center">
                      {row.sefpos === true
                        ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100"><Check className="w-3.5 h-3.5 text-green-600" /></span>
                        : <span className="text-sm font-semibold text-orange-600">{String(row.sefpos)}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {row.generic === true
                        ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100"><Check className="w-3.5 h-3.5 text-slate-400" /></span>
                        : row.generic === false
                          ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50"><X className="w-3.5 h-3.5 text-red-400" /></span>
                          : <span className="text-sm text-slate-400">{row.generic}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          REFERANSLAR
      ══════════════════════════════════════════ */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionHeading eyebrow="Müşteriler" title="Sahadan geri bildirimler" />
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <blockquote
                key={t.name}
                className="bg-white rounded-2xl border border-slate-200 p-7 hover:border-orange-200 hover:shadow-md transition-all"
              >
                <div className="flex gap-0.5 mb-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-orange-400 text-orange-400" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed mb-5 text-[15px]">&ldquo;{t.quote}&rdquo;</p>
                <footer>
                  <p className="font-bold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FİYATLANDIRMA
      ══════════════════════════════════════════ */}
      <section className="py-20 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionHeading
            eyebrow="Fiyatlandırma"
            title="İşletmenize uygun lisans"
            subtitle="Şeffaf fiyatlandırma — kurulum, eğitim ve güncelleme dahil. Gizli maliyet yok."
          />
          <div className="landing-pricing-grid">
            {PRICING_PLANS.map((plan) => (
              <PricingPlanCard key={plan.name} plan={plan} onCta={onLogin} variant="preview" />
            ))}
          </div>
          <div className="text-center mt-8">
            <button
              type="button"
              onClick={() => onNavigate('/fiyatlar')}
              className="landing-link-more"
            >
              Fiyatlandırma detayları <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SSS
      ══════════════════════════════════════════ */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <SectionHeading title="Sık Sorulan Sorular" align="center" />
          <div className="space-y-3">
            {FAQ_ITEMS.slice(0, 4).map((item) => (
              <details key={item.q} className="group bg-white rounded-xl border border-slate-200 open:border-orange-200 transition-colors">
                <summary className="px-5 py-4 font-semibold text-slate-900 cursor-pointer list-none flex justify-between items-center text-sm">
                  {item.q}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform shrink-0 ml-2" />
                </summary>
                <p className="px-5 pb-5 text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          BÖLGE SEO
      ══════════════════════════════════════════ */}
      <section className="py-14 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Türkiye Geneli</p>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">
            Türkiye&apos;nin her ilinde ŞefPOS
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto mb-6 text-sm leading-relaxed">
            {TURKEY_STATS.provinceCount} il ve {TURKEY_STATS.districtCount} ilçe için adisyon yazılımı,
            barkod sistemi, restoran yazılımı ve masa takip sistemi sayfaları.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/bolge')}
            className="landing-btn-primary inline-flex"
          >
            İl ve ilçenizi seçin <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <CTABand
        title="ŞefPOS'u işletmenizde deneyin"
        subtitle="Salon, paket, online, kasa ve mutfak — demo, kurulum ve eğitim için hemen iletişime geçin."
        onPrimary={onLogin}
        onSecondary={() => { window.location.href = SITE.phoneTel; }}
        secondaryLabel="Hemen Arayın"
      />
    </>
  );
}
