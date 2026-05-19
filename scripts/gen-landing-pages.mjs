import fs from 'fs';
import path from 'path';

const D = 'div';
const out = path.join(process.cwd(), 'src/components/landing/pages/LandingPages.tsx');

const content = `import { useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  X,
  Download,
  Star,
  Zap,
  Shield,
  Laptop,
  Wifi,
  HardDrive,
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  ChevronDown,
  Building2,
} from 'lucide-react';
import type { LandingRoute } from '../content/siteContent';
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
  RESELLER_TIERS,
} from '../content/siteContent';
import { HeroDashboard } from '../components/HeroDashboard';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';
import { FeatureCard } from '../components/FeatureCard';
import { ResellerForm } from '../components/ResellerForm';

export type LandingPageProps = {
  onLogin: () => void;
  onNavigate: (path: LandingRoute) => void;
};

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <${D} className="max-w-3xl mx-auto space-y-3">
      {FAQ_ITEMS.map((item, i) => (
        <${D} key={item.q} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left font-bold text-slate-900"
            onClick={() => setOpen(open === i ? null : i)}
          >
            {item.q}
            <ChevronDown className={\`w-5 h-5 transition \${open === i ? 'rotate-180' : ''}\`} />
          </button>
          {open === i && <p className="px-5 pb-4 text-slate-600 text-sm leading-relaxed">{item.a}</p>}
        </${D}>
      ))}
    </${D}>
  );
}

export function HomePage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <${D} className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-600/20 via-transparent to-transparent" />
        <${D} className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
        <${D} className="relative max-w-7xl mx-auto px-4 pt-16 pb-24 md:pt-24 md:pb-32">
          <${D} className="grid lg:grid-cols-2 gap-12 items-center">
            <${D}>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-400 mb-4">
                <Zap className="w-4 h-4" /> Yeni: Partner API & HemenYolda
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight mb-6">
                Restoranınızın <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">tek komuta merkezi</span>
              </h1>
              <p className="text-lg text-slate-300 mb-8 max-w-xl leading-relaxed">
                Masa, paket, online platformlar ve kurye — hepsi ŞefPOS’ta. Caller ID ile saniyeler içinde sipariş; Getir, Yemeksepeti, Trendyol ve Migros tek panelde.
              </p>
              <${D} className="flex flex-col sm:flex-row gap-4 mb-10">
                <button type="button" onClick={onLogin} className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30">
                  {SITE.trialDays} Gün Ücretsiz Dene <ArrowRight className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => onNavigate('/indir')} className="border border-slate-600 hover:border-orange-500 text-white font-bold px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2">
                  <Download className="w-5 h-5" /> Windows İndir
                </button>
              </${D}>
              <${D} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {HERO_STATS.map((s) => (
                  <${D} key={s.label} className="text-center sm:text-left">
                    <p className="text-2xl font-black text-orange-400">{s.value}</p>
                    <p className="text-xs text-slate-400 font-medium">{s.label}</p>
                  </${D}>
                ))}
              </${D}>
            </${D}>
            <${D} className="relative">
              <${D} className="absolute -inset-4 bg-orange-500/20 blur-3xl rounded-full" />
              <${D} className="relative rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden aspect-[4/3] bg-slate-900">
                <HeroDashboard />
              </${D}>
            </${D}>
          </${D}>
        </${D}>
      </section>

      <section className="py-20 md:py-28 bg-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Öne çıkanlar" title="Yoğun saatte bile hızlı POS" subtitle="Paket servis optimizasyonu, online sipariş merkezi ve kurumsal bildirimler — rakiplerin çoğunda olmayan özellikler." />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CORE_FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </${D}>
          <${D} className="text-center mt-10">
            <button type="button" onClick={() => onNavigate('/ozellikler')} className="text-orange-600 font-bold inline-flex items-center gap-2 hover:gap-3 transition-all">
              Tüm özellikleri gör <ArrowRight className="w-5 h-5" />
            </button>
          </${D}>
        </${D}>
      </section>

      <section className="py-16 bg-slate-100">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Entegrasyonlar" title="Tüm platformlar, tek ekran" subtitle="Sipariş kaçırmayın; mutfak fişi ve durum güncellemeleri otomatik." />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INTEGRATIONS.slice(0, 6).map((int) => (
              <${D} key={int.name} className={\`rounded-2xl bg-gradient-to-br \${int.color} p-6 text-white shadow-lg\`}>
                <h3 className="font-black text-lg mb-2">{int.name}</h3>
                <p className="text-sm text-white/90">{int.desc}</p>
              </${D}>
            ))}
          </${D}>
          <${D} className="text-center mt-8">
            <button type="button" onClick={() => onNavigate('/entegrasyonlar')} className="font-bold text-slate-700 hover:text-orange-600">Entegrasyon detayları →</button>
          </${D}>
        </${D}>
      </section>

      <section className="py-20 bg-slate-900 text-white">
        <${D} className="max-w-5xl mx-auto px-4">
          <SectionHeading light eyebrow="Karşılaştırma" title="Neden ŞefPOS?" subtitle="Genel adisyon yazılımlarıyla yan yana." />
          <${D} className="overflow-hidden rounded-2xl border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800">
                  <th className="text-left p-4 font-bold">Özellik</th>
                  <th className="p-4 font-bold text-orange-400">ŞefPOS</th>
                  <th className="p-4 font-bold text-slate-400">Genel çözüm</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-slate-700">
                    <td className="p-4">{row.label}</td>
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

      <section className="py-20 bg-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading eyebrow="Referanslar" title="İşletmeler ne diyor?" />
          <${D} className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <blockquote key={t.name} className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <${D} className="flex gap-1 mb-3">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}</${D}>
                <p className="text-slate-700 mb-4 italic">&ldquo;{t.quote}&rdquo;</p>
                <footer className="text-sm font-bold text-slate-900">{t.name}</footer>
                <p className="text-xs text-slate-500">{t.role}</p>
              </blockquote>
            ))}
          </${D}>
        </${D}>
      </section>

      <CTABand
        title={\`\${SITE.trialDays} gün ücretsiz deneyin\`}
        subtitle="Kurulum ve eğitim desteğiyle dakikalar içinde sipariş almaya başlayın."
        onPrimary={onLogin}
        onSecondary={() => { window.location.href = SITE.phoneTel; }}
        secondaryLabel="Hemen Arayın"
      />
    </>
  );
}

export function FeaturesPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="bg-slate-950 text-white py-20">
        <${D} className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Her modül, gerçek restoran ihtiyacı için</h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">Salondan mutfağa, paketten online platformlara kadar uçtan uca.</p>
        </${D}>
      </section>
      <section className="py-20 bg-white">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Temel modüller" />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {CORE_FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </${D}>
          <SectionHeading title="Gelişmiş yetenekler" subtitle="Zincir, franchise ve teknik entegrasyon ihtiyaçları." />
          <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ADVANCED_FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </${D}>
        </${D}>
      </section>
      <CTABand title="Canlı demo isteyin" subtitle="Uzaktan ekran paylaşımıyla işletmenize özel tur." onPrimary={onLogin} onSecondary={() => onNavigate('/iletisim')} secondaryLabel="İletişim" />
    </>
  );
}

export function IntegrationsPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="bg-gradient-to-br from-slate-900 to-slate-950 text-white py-20">
        <${D} className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Platform entegrasyonları</h1>
          <p className="text-slate-300 text-lg max-w-2xl">Webhook, API ve güvenli proxy ile siparişler anında kasanıza düşer.</p>
        </${D}>
      </section>
      <section className="py-20 bg-slate-50">
        <${D} className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-6">
          {INTEGRATIONS.map((int) => (
            <article key={int.name} className={\`rounded-2xl bg-gradient-to-br \${int.color} p-8 text-white shadow-xl\`}>
              <h2 className="text-2xl font-black mb-3">{int.name}</h2>
              <p className="text-white/90 leading-relaxed">{int.desc}</p>
            </article>
          ))}
        </${D}>
      </section>
      <section className="py-16 bg-white border-y border-slate-200">
        <${D} className="max-w-3xl mx-auto px-4 text-center">
          <Shield className="w-12 h-12 text-orange-600 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">Partner API</h2>
          <p className="text-slate-600">Kendi yazılımınızdan sipariş gönderin; Cloudflare üzerinden güvenli uç nokta. Ayarlar panelinde API anahtarı ve dokümantasyon.</p>
        </${D}>
      </section>
      <CTABand title="Entegrasyon kurulumu" subtitle="Getir, YS, Trendyol bağlantılarında yanınızdayız." onPrimary={() => onNavigate('/iletisim')} primaryLabel="Kurulum Talep Et" onSecondary={onLogin} secondaryLabel="Panele Giriş" />
    </>
  );
}

export function PricingPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="bg-white py-20">
        <${D} className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">Şeffaf paketler</h1>
          <p className="text-slate-600 text-lg">İşletme büyüklüğünüze göre ölçeklenen lisans. Fiyat için bizi arayın — gizli maliyet yok.</p>
        </${D}>
      </section>
      <section className="pb-20">
        <${D} className="max-w-6xl mx-auto px-4 grid md:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan) => (
            <${D}
              key={plan.name}
              className={\`rounded-2xl border p-8 flex flex-col \${
                plan.highlight ? 'border-orange-500 shadow-xl shadow-orange-500/10 scale-[1.02] bg-orange-50/50' : 'border-slate-200 bg-white'
              }\`}
            >
              {plan.highlight && <span className="text-xs font-bold text-orange-600 uppercase mb-2">En popüler</span>}
              <h2 className="text-2xl font-black text-slate-900">{plan.name}</h2>
              <p className="text-sm text-slate-500 mt-1 mb-6">{plan.ideal}</p>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="w-5 h-5 text-green-600 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onLogin} className={\`w-full py-3 rounded-xl font-bold \${plan.highlight ? 'bg-orange-600 text-white' : 'bg-slate-900 text-white'}\`}>
                Teklif Al
              </button>
            </${D}>
          ))}
        </${D}>
      </section>
      <section className="py-20 bg-slate-50">
        <${D} className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Sık sorulan sorular" />
          <FaqAccordion />
        </${D}>
      </section>
      <CTABand title="Hangi paket size uygun?" subtitle="5 dakikalık görüşmeyle netleştirelim." onPrimary={() => onNavigate('/iletisim')} primaryLabel="Bize Ulaşın" onSecondary={onLogin} />
    </>
  );
}

export function DownloadPage({ onLogin }: LandingPageProps) {
  const ver = '1.0.148';
  return (
    <>
      <section className="bg-slate-950 text-white py-20">
        <${D} className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <${D}>
            <h1 className="text-4xl md:text-5xl font-black mb-4">Windows masaüstü</h1>
            <p className="text-slate-300 text-lg mb-6">Yazıcı, terazi ve Caller ID için Electron sürümü. Otomatik güncelleme ile her zaman güncel kalın.</p>
            <a
              href="https://github.com/sefposbulut/sefpos-releases/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold px-8 py-4 rounded-xl"
            >
              <Download className="w-5 h-5" /> Sefpos-Setup indir
            </a>
            <p className="text-sm text-slate-500 mt-3">Güncel sürüm: v{ver}</p>
          </${D}>
          <${D} className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Laptop className="w-5 h-5 text-orange-400" /> Sistem gereksinimleri</h2>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex gap-2"><HardDrive className="w-5 h-5 text-orange-400 shrink-0" /> Windows 10/11 (64-bit), 4 GB RAM</li>
              <li className="flex gap-2"><Wifi className="w-5 h-5 text-orange-400 shrink-0" /> İnternet (bulut mod) veya SQL Server (şube mod)</li>
              <li className="flex gap-2"><Shield className="w-5 h-5 text-orange-400 shrink-0" /> Otomatik güncelleme — onaylı kurulum</li>
            </ul>
          </${D}>
        </${D}>
      </section>
      <CTABand title="Web panelden de kullanın" subtitle="Tarayıcıdan giriş; masaüstü şart değil." onPrimary={onLogin} primaryLabel="Web Girişi" />
    </>
  );
}

type ResellerRow = { id: string; company_name: string; contact_name?: string; phone?: string; email?: string; notes?: string };

export function ResellerPage({ onLogin }: LandingPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [network, setNetwork] = useState<ResellerRow[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { supabase } = await import('../../../lib/supabase');
        const { data: resellerData } = await supabase.from('resellers').select('id, company_name, contact_name, phone, email, notes').order('created_at', { ascending: false }).limit(12);
        const { data: appData } = await supabase.from('reseller_applications').select('id, company_name, contact_name, phone, email, city, status').eq('status', 'approved').order('created_at', { ascending: false }).limit(12);
        const merged = [
          ...((resellerData || []) as ResellerRow[]).map((r) => ({ id: \`r-\${r.id}\`, company_name: r.company_name, contact_name: r.contact_name, phone: r.phone, email: r.email, notes: r.notes })),
          ...((appData || []) as { id: string; company_name: string; contact_name?: string; phone?: string; email?: string; city?: string }[]).map((a) => ({ id: \`a-\${a.id}\`, company_name: a.company_name, contact_name: a.contact_name, phone: a.phone, email: a.email, notes: a.city || '' })),
        ];
        const dedup = Array.from(new Map(merged.map((x) => [x.company_name?.toLowerCase() || x.id, x])).values()).slice(0, 12);
        if (mounted) setNetwork(dedup);
      } catch {
        if (mounted) setNetwork([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <section className="bg-gradient-to-br from-orange-600 to-amber-500 text-white py-20">
        <${D} className="max-w-7xl mx-auto px-4 text-center">
          <Building2 className="w-14 h-14 mx-auto mb-4 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-black mb-4">Bayi & çözüm ortağı programı</h1>
          <p className="text-lg text-orange-50 max-w-2xl mx-auto">Yüksek komisyon, haftalık ödeme ve teknik destek hattı.</p>
        </${D}>
      </section>
      <section className="py-20 bg-white">
        <${D} className="max-w-6xl mx-auto px-4 grid md:grid-cols-3 gap-6">
          {RESELLER_TIERS.map((tier) => (
            <${D} key={tier.title} className={\`rounded-2xl border p-6 \${tier.highlight ? 'border-orange-500 bg-orange-50' : 'border-slate-200'}\`}>
              <h2 className="text-xl font-black">{tier.title}</h2>
              <p className="text-3xl font-black text-orange-600 my-2">{tier.commission}</p>
              <p className="text-sm text-slate-500 mb-4">{tier.volume}</p>
              <ul className="space-y-2 text-sm">{tier.perks.map((p) => <li key={p} className="flex gap-2"><Check className="w-4 h-4 text-green-600" />{p}</li>)}</ul>
            </${D}>
          ))}
        </${D}>
        <${D} className="text-center mt-10">
          <button type="button" onClick={() => setShowForm(true)} className="bg-orange-600 text-white font-bold px-8 py-4 rounded-xl">Bayi Başvurusu Yap</button>
        </${D}>
      </section>
      {network.length > 0 && (
        <section className="py-16 bg-slate-50">
          <${D} className="max-w-7xl mx-auto px-4">
            <SectionHeading title="Bayi ağımız" subtitle="Onaylı iş ortaklarımızdan bazıları." />
            <${D} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {network.map((r) => (
                <${D} key={r.id} className="bg-white rounded-xl border p-4">
                  <p className="font-bold">{r.company_name}</p>
                  {r.notes && <p className="text-sm text-slate-500">{r.notes}</p>}
                </${D}>
              ))}
            </${D}>
          </${D}>
        </section>
      )}
      {showForm && (
        <${D} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <ResellerForm onClose={() => setShowForm(false)} />
        </${D}>
      )}
    </>
  );
}

export function ContactPage({ onLogin }: LandingPageProps) {
  return (
    <>
      <section className="bg-white py-20">
        <${D} className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-black text-center mb-12">İletişim</h1>
          <${D} className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <a href={SITE.phoneTel} className="rounded-2xl border p-6 hover:border-orange-500 transition text-center">
              <Phone className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <p className="font-bold">{SITE.phone}</p>
            </a>
            <a href={\`mailto:\${SITE.email}\`} className="rounded-2xl border p-6 hover:border-orange-500 transition text-center">
              <Mail className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <p className="font-bold">{SITE.email}</p>
            </a>
            <a href={SITE.whatsapp} target="_blank" rel="noreferrer" className="rounded-2xl border p-6 hover:border-orange-500 transition text-center">
              <MessageCircle className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <p className="font-bold">WhatsApp</p>
            </a>
          </${D}>
          <p className="text-center text-slate-500 mt-8 flex items-center justify-center gap-2"><MapPin className="w-4 h-4" /> {SITE.address}</p>
        </${D}>
      </section>
      <CTABand title="Demo randevusu" subtitle="İşletmenize özel 30 dakikalık tanıtım." onPrimary={onLogin} onSecondary={() => { window.location.href = SITE.whatsapp; }} secondaryLabel="WhatsApp" />
    </>
  );
}
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const fixed = content.replaceAll('<motion.div', '<div').replaceAll('</motion.div', '</div');
fs.writeFileSync(out, fixed, 'utf8');
console.log('wrote LandingPages.tsx');
