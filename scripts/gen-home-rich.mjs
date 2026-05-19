import fs from 'fs';
import path from 'path';

const out = path.join(process.cwd(), 'src/components/landing/sections/HomeRichSections.tsx');
const D = 'motion.div';

const content = `import {
  ArrowRight,
  Check,
  X,
  Download,
  Star,
  Zap,
  Phone,
  ChevronRight,
  UtensilsCrossed,
  Store,
  Headphones,
} from 'lucide-react';
import type { LandingPageProps } from '../pages/LandingPages';
import {
  SITE,
  HERO_STATS,
  CORE_FEATURES,
  ADVANCED_FEATURES,
  INTEGRATIONS,
  COMPARISON_ROWS,
  TESTIMONIALS,
  PRICING_PLANS,
  FAQ_ITEMS,
  TRUST_ITEMS,
  INDUSTRIES,
  WORKFLOW_STEPS,
  PROOF_POINTS,
  MODULE_HIGHLIGHTS,
} from '../content/siteContent';
import { BrandLogo } from '../components/BrandLogo';
import { HeroDashboard } from '../components/HeroDashboard';
import { IntegrationMarquee } from '../components/IntegrationMarquee';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';
import { FeatureCard } from '../components/FeatureCard';

export function HomeRichPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-black text-white landing-hero-bg">
        <${D} className="absolute inset-0 landing-hero-glow" aria-hidden />
        <${D} className="absolute top-20 right-0 w-[480px] h-[480px] bg-red-900/20 blur-[100px] rounded-full" aria-hidden />
        <${D} className="relative max-w-7xl mx-auto px-4 pt-8 pb-20 md:pt-14 md:pb-28">
          <${D} className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <${D}>
              <${D} className="flex items-center gap-4 mb-6">
                <BrandLogo size="xl" onDark />
                <${D} className="hidden sm:block h-12 w-px bg-white/15" />
                <${D} className="hidden sm:block">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">ŞefPOS</p>
                  <p className="text-sm text-slate-400 font-medium">Restoran adisyon yazılımı</p>
                </${D}>
              </${D}>
              <span className="landing-badge mb-4 inline-flex">
                <Zap className="w-3.5 h-3.5" /> Türkiye&apos;nin modern restoran POS&apos;u
              </span>
              <h1 className="text-4xl md:text-5xl xl:text-[3.25rem] font-black leading-[1.08] tracking-tight mb-5">
                Gerçek bir{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">
                  adisyon yazılımı
                </span>
                — masa, paket ve online tek ekranda
              </h1>
              <p className="text-lg text-slate-300 mb-8 max-w-xl leading-relaxed">
                ŞefPOS; restoran, cafe ve paket servis işletmeleri için profesyonel kasa, mutfak fişi,
                platform entegrasyonları ve gün sonu raporlarını bir araya getirir. Kurulumdan eğitime kadar yanınızdayız.
              </p>
              <${D} className="flex flex-col sm:flex-row gap-3 mb-8">
                <button type="button" onClick={onLogin} className="landing-btn-primary">
                  Ücretsiz Dene <ArrowRight className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => onNavigate('/indir')} className="landing-btn-outline">
                  <Download className="w-5 h-5" /> Windows İndir
                </button>
              </${D}>
              <ul className="flex flex-wrap gap-2 mb-8">
                {TRUST_ITEMS.map((t) => (
                  <li key={t} className="text-[11px] font-semibold text-slate-300 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                    <Check className="w-3 h-3 inline text-orange-400 mr-1 -mt-px" />
                    {t}
                  </li>
                ))}
              </ul>
              <${D} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {HERO_STATS.map((s) => (
                  <${D} key={s.label} className="landing-stat-pill">
                    <p className="text-xl md:text-2xl font-black text-orange-400 tabular-nums">{s.value}</p>
                    <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-0.5">{s.label}</p>
                  </${D}>
                ))}
              </${D}>
            </${D}>
            <${D} className="relative">
              <${D} className="absolute -inset-8 landing-logo-ring blur-2xl opacity-60" aria-hidden />
              <${D} className="relative rounded-3xl border border-red-900/50 shadow-2xl shadow-black/50 overflow-hidden aspect-[5/4] min-h-[300px] bg-black ring-2 ring-orange-500/20">
                <HeroDashboard />
              </${D}>
              <${D} className="absolute -bottom-4 -left-2 md:left-4 bg-white text-slate-900 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 border border-orange-100">
                <${D} className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-5 h-5 text-white" />
                </${D}>
                <${D}>
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-wide">Canlı POS</p>
                  <p className="text-sm font-black">Masa · Paket · Online</p>
                </${D}>
              </${D}>
            </${D}>
          </${D}>
        </${D}>
      </section>

      {/* GÜVEN ŞERİDİ */}
      <section className="bg-gradient-to-r from-orange-600 via-orange-500 to-red-800 text-white py-4 border-y border-orange-400/30">
        <${D} className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-semibold">
          <span className="inline-flex items-center gap-2"><Store className="w-4 h-4" /> 500+ işletme güveniyor</span>
          <span className="hidden sm:inline opacity-40">|</span>
          <span className="inline-flex items-center gap-2"><Headphones className="w-4 h-4" /> Türkçe teknik destek</span>
          <span className="hidden md:inline opacity-40">|</span>
          <span className="hidden md:inline">Getir · Yemeksepeti · Trendyol · Migros · HemenYolda</span>
        </${D}>
      </section>

      {/* SEKTÖRLER */}
      <section className="py-12 bg-white border-b border-slate-100">
        <${D} className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-4">Her ölçekte işletme</p>
          <${D} className="flex flex-wrap justify-center gap-2">
            {INDUSTRIES.map((ind) => (
              <span key={ind} className="px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 hover:border-orange-300 hover:text-orange-700 transition">
                {ind}
              </span>
            ))}
          </${D}>
        </${D}>
      </section>

      {/* MODÜL ŞERİDİ */}
      <section className="py-10 bg-slate-50">
        <${D} className="max-w-7xl mx-auto px-4">
          <${D} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {MODULE_HIGHLIGHTS.map(({ label, icon: Icon }) => (
              <${D} key={label} className="flex items-center gap-2 bg-white rounded-xl border border-slate-200/80 px-3 py-2.5 shadow-sm hover:border-orange-300 hover:shadow-md transition">
                <${D} className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </${D}>
                <span className="text-xs font-bold text-slate-800 leading-tight">{label}</span>
              </${D}>
            ))}
          </${D}>
        </${D}>
      </section>

      {/* TEMEL ÖZELLİKLER */}
      <section className="py-20 md:py-28 bg-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading
            eyebrow="Adisyon & operasyon"
            title="Restoranınızın ihtiyacı olan her modül"
            subtitle="Sadece kasa değil; salon, paket, online, mutfak, stok ve raporlama — profesyonel bir adisyon yazılımının tam kapsamı."
          />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CORE_FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </${D}>
          <${D} className="text-center mt-12">
            <button type="button" onClick={() => onNavigate('/ozellikler')} className="landing-link-more">
              Tüm özellikleri incele <ArrowRight className="w-5 h-5" />
            </button>
          </${D}>
        </${D}>
      </section>

      {/* İŞ AKIŞI */}
      <section className="py-20 bg-slate-950 text-white relative overflow-hidden">
        <${D} className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(249,115,22,0.12),transparent_50%)]" aria-hidden />
        <${D} className="max-w-7xl mx-auto px-4 relative">
          <SectionHeading
            light
            eyebrow="Nasıl çalışır?"
            title="Siparişten rapora 4 adım"
            subtitle="Personel eğitimi kolay; ekranlar Türkçe ve yoğun saate dayanıklı."
          />
          <${D} className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {WORKFLOW_STEPS.map((w) => (
              <article key={w.step} className="landing-workflow-card">
                <span className="text-4xl font-black text-orange-500/40">{w.step}</span>
                <h3 className="text-lg font-black mt-2 mb-2">{w.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{w.desc}</p>
              </article>
            ))}
          </${D}>
        </${D}>
      </section>

      {/* KANIT */}
      <section className="py-20 bg-gradient-to-b from-orange-50 to-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading
            eyebrow="Neden ŞefPOS?"
            title="Gerçek adisyon deneyimi"
            subtitle="Rakip çözümlerde eksik kalan paket performansı, platform birliği ve yerel destek — bizde standart."
          />
          <${D} className="grid md:grid-cols-3 gap-8">
            {PROOF_POINTS.map((p) => (
              <article key={p.title} className="text-center md:text-left bg-white rounded-3xl p-8 border border-orange-100 shadow-lg shadow-orange-500/5">
                <${D} className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-800 flex items-center justify-center mx-auto md:mx-0 mb-5 shadow-lg shadow-orange-500/25">
                  <p.icon className="w-7 h-7 text-white" />
                </${D}>
                <h3 className="text-xl font-black text-slate-900 mb-2">{p.title}</h3>
                <p className="text-slate-600 leading-relaxed">{p.desc}</p>
              </article>
            ))}
          </${D}>
        </${D}>
      </section>

      {/* GELİŞMİŞ ÖZELLİKLER */}
      <section className="py-20 bg-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Kurumsal" title="Gelişmiş yetenekler" subtitle="Zincir, franchise ve çok şubeli yapılar için." />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ADVANCED_FEATURES.map((f) => (
              <${D} key={f.title} className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/80 hover:bg-white hover:border-orange-200 hover:shadow-md transition">
                <${D} className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-orange-600" />
                </${D}>
                <${D}>
                  <h3 className="font-bold text-slate-900 text-sm">{f.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.desc}</p>
                </${D}>
              </${D}>
            ))}
          </${D}>
        </${D}>
      </section>

      {/* ENTEGRASYON */}
      <section className="py-20 bg-slate-100">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Platformlar" title="Online siparişler tek merkezde" subtitle="Firma logolarıyla entegre — sipariş kaçırmayın." />
          <IntegrationMarquee />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
            {INTEGRATIONS.map((int) => (
              <article key={int.name} className={\`rounded-2xl bg-gradient-to-br \${int.color} p-5 text-white shadow-lg\`}>
                <h3 className="font-black text-lg">{int.name}</h3>
                <p className="text-sm text-white/90 mt-2 leading-relaxed">{int.desc}</p>
              </article>
            ))}
          </${D}>
          <${D} className="text-center mt-8">
            <button type="button" onClick={() => onNavigate('/entegrasyonlar')} className="font-bold text-orange-600 hover:text-red-700">
              Tüm entegrasyonlar <ChevronRight className="w-4 h-4 inline" />
            </button>
          </${D}>
        </${D}>
      </section>

      {/* KARŞILAŞTIRMA */}
      <section className="py-20 bg-slate-900 text-white">
        <${D} className="max-w-5xl mx-auto px-4">
          <SectionHeading light eyebrow="Karşılaştırma" title="Genel yazılımlara göre farkımız" />
          <${D} className="overflow-hidden rounded-2xl border border-slate-700 shadow-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-orange-600 to-red-800">
                  <th className="text-left p-4 font-bold">Özellik</th>
                  <th className="p-4 font-bold">ŞefPOS</th>
                  <th className="p-4 font-bold text-slate-300">Genel çözüm</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-800/50' : 'bg-slate-800/30'}>
                    <td className="p-4 font-medium">{row.label}</td>
                    <td className="p-4 text-center">{row.sefpos === true ? <Check className="w-5 h-5 text-green-400 mx-auto" /> : String(row.sefpos)}</td>
                    <td className="p-4 text-center text-slate-400">
                      {row.generic === true ? <Check className="w-5 h-5 mx-auto" /> : row.generic === false ? <X className="w-5 h-5 text-red-400 mx-auto" /> : row.generic}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </${D}>
        </${D}>
      </section>

      {/* REFERANSLAR */}
      <section className="py-20 bg-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Müşteriler" title="Sahadan geri bildirimler" />
          <${D} className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <blockquote key={t.name} className="landing-testimonial">
                <${D} className="flex gap-1 mb-4">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}</${D}>
                <p className="text-slate-700 mb-4 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <footer className="font-black text-slate-900">{t.name}</footer>
                <p className="text-xs text-slate-500 mt-1">{t.role}</p>
              </blockquote>
            ))}
          </${D}>
        </${D}>
      </section>

      {/* FİYAT ÖNİZLEME */}
      <section className="py-20 bg-slate-50">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Paketler" title="İşletmenize uygun lisans" subtitle="Şeffaf fiyatlandırma — gizli maliyet yok. Detay için bizi arayın." />
          <${D} className="grid md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <article key={plan.name} className={\`rounded-3xl p-8 border flex flex-col \${plan.highlight ? 'border-orange-500 bg-white shadow-xl shadow-orange-500/10 ring-2 ring-orange-500/20' : 'border-slate-200 bg-white'}\`}>
                {plan.highlight && <span className="text-xs font-bold text-orange-600 uppercase mb-2">En popüler</span>}
                <h3 className="text-2xl font-black">{plan.name}</h3>
                <p className="text-sm text-slate-500 mt-1 mb-6">{plan.ideal}</p>
                <ul className="space-y-2 flex-1 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-green-600 shrink-0" />{f}</li>
                  ))}
                </ul>
                <button type="button" onClick={onLogin} className={\`mt-6 w-full py-3 rounded-xl font-bold \${plan.highlight ? 'landing-btn-primary justify-center' : 'bg-slate-900 text-white hover:bg-slate-800'}\`}>
                  Teklif Al
                </button>
              </article>
            ))}
          </${D}>
          <${D} className="text-center mt-8">
            <button type="button" onClick={() => onNavigate('/fiyatlar')} className="landing-link-more">
              Fiyatlandırma detayları <ArrowRight className="w-5 h-5" />
            </button>
          </${D}>
        </${D}>
      </section>

      {/* SSS ÖNİZLEME */}
      <section className="py-16 bg-white border-t border-slate-100">
        <${D} className="max-w-3xl mx-auto px-4">
          <SectionHeading title="Sık sorulan sorular" align="center" />
          <${D} className="space-y-3">
            {FAQ_ITEMS.slice(0, 3).map((item) => (
              <details key={item.q} className="group bg-slate-50 rounded-xl border border-slate-200 open:border-orange-200">
                <summary className="px-5 py-4 font-bold text-slate-900 cursor-pointer list-none flex justify-between items-center">
                  {item.q}
                  <ChevronRight className="w-5 h-5 text-orange-500 group-open:rotate-90 transition" />
                </summary>
                <p className="px-5 pb-4 text-slate-600 text-sm leading-relaxed">{item.a}</p>
              </details>
            ))}
          </${D}>
        </${D}>
      </section>

      <CTABand
        title="Profesyonel adisyona geçin"
        subtitle="Demo, kurulum ve eğitim için hemen iletişime geçin — Ücretsiz Dene ile başlayın."
        onPrimary={onLogin}
        onSecondary={() => { window.location.href = SITE.phoneTel; }}
        secondaryLabel="Hemen Arayın"
      />
    </>
  );
}
`;

const fixed = content.replaceAll('<motion.div', '<div').replaceAll('</motion.div>', '</div>');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, fixed, 'utf8');
console.log('wrote', out);
