import { useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  X,
  Download,
  Star,
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
  CORE_FEATURES,
  ADVANCED_FEATURES,
  INTEGRATIONS,
  PRICING_PLANS,
  FAQ_ITEMS,
  RESELLER_TIERS,
} from '../content/siteContent';
import { PlatformLogo } from '../../PlatformLogo';
import { IntegrationMarquee } from '../components/IntegrationMarquee';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';
import { FeatureCard } from '../components/FeatureCard';
import { ResellerForm } from '../components/ResellerForm';
import { HomeRichPage } from '../sections/HomeRichSections';
import { APP_VERSION } from '../../../lib/appVersion';

export type LandingPageProps = {
  onLogin: () => void;
  onNavigate: (path: string) => void;
};

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {FAQ_ITEMS.map((item, i) => (
        <div key={item.q} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-4 text-left font-bold text-slate-900"
            onClick={() => setOpen(open === i ? null : i)}
          >
            {item.q}
            <ChevronDown className={`w-5 h-5 transition ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && <p className="px-5 pb-4 text-slate-600 text-sm leading-relaxed">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

export function HomePage(props: LandingPageProps) {
  return <HomeRichPage {...props} />;
}

/** @deprecated Eski ana sayfa — HomeRichPage kullanılıyor */
export function FeaturesPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="bg-slate-950 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Her modül, gerçek restoran ihtiyacı için</h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">Salondan mutfağa, paketten online platformlara kadar uçtan uca.</p>
        </div>
      </section>
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Temel modüller" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {CORE_FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
          <SectionHeading title="Gelişmiş yetenekler" subtitle="Zincir, franchise ve teknik entegrasyon ihtiyaçları." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ADVANCED_FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>
      <CTABand title="Canlı demo isteyin" subtitle="Uzaktan ekran paylaşımıyla işletmenize özel tur." onPrimary={onLogin} onSecondary={() => onNavigate('/iletisim')} secondaryLabel="İletişim" />
    </>
  );
}

export function IntegrationsPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="bg-gradient-to-br from-slate-900 to-slate-950 text-white py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Platform entegrasyonları</h1>
          <p className="text-slate-300 text-lg max-w-2xl">Webhook, API ve güvenli proxy ile siparişler anında kasanıza düşer.</p>
        </div>
      </section>
      <section className="py-12 bg-slate-100 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4">
          <IntegrationMarquee />
        </div>
      </section>
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-6">
          {INTEGRATIONS.map((int) => (
            <article key={int.name} className={`rounded-2xl bg-gradient-to-br ${int.color} p-8 text-white shadow-xl`}>
              <div className="mb-4 bg-white/95 rounded-xl inline-flex px-4 py-3">
                <PlatformLogo code={int.code} name={int.name} size="md" />
              </div>
              <h2 className="text-2xl font-black mb-3">{int.name}</h2>
              <p className="text-white/90 leading-relaxed">{int.desc}</p>
            </article>
          ))}
        </div>
      </section>
      <CTABand title="Entegrasyon kurulumu" subtitle="Getir, YS, Trendyol bağlantılarında yanınızdayız." onPrimary={() => onNavigate('/iletisim')} primaryLabel="Kurulum Talep Et" onSecondary={onLogin} secondaryLabel="Panele Giriş" />
    </>
  );
}

export function PricingPage({ onLogin, onNavigate }: LandingPageProps) {
  return (
    <>
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">Şeffaf paketler</h1>
          <p className="text-slate-600 text-lg">İşletme büyüklüğünüze göre ölçeklenen lisans. Fiyat için bizi arayın — gizli maliyet yok.</p>
        </div>
      </section>
      <section className="pb-20">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.highlight ? 'border-orange-500 shadow-xl shadow-orange-500/10 scale-[1.02] bg-orange-50/50' : 'border-slate-200 bg-white'
              }`}
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
              <button type="button" onClick={onLogin} className={`w-full py-3 rounded-xl font-bold ${plan.highlight ? 'bg-orange-600 text-white' : 'bg-slate-900 text-white'}`}>
                Teklif Al
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Sık sorulan sorular" />
          <FaqAccordion />
        </div>
      </section>
      <CTABand title="Hangi paket size uygun?" subtitle="5 dakikalık görüşmeyle netleştirelim." onPrimary={() => onNavigate('/iletisim')} primaryLabel="Bize Ulaşın" onSecondary={onLogin} />
    </>
  );
}

export function DownloadPage({ onLogin }: LandingPageProps) {
  const ver = APP_VERSION;
  return (
    <>
      <section className="bg-slate-950 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div>
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
          </div>
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Laptop className="w-5 h-5 text-orange-400" /> Sistem gereksinimleri</h2>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex gap-2"><HardDrive className="w-5 h-5 text-orange-400 shrink-0" /> Windows 10/11 (64-bit), 4 GB RAM</li>
              <li className="flex gap-2"><Wifi className="w-5 h-5 text-orange-400 shrink-0" /> İnternet (bulut mod) veya SQL Server (şube mod)</li>
              <li className="flex gap-2"><Shield className="w-5 h-5 text-orange-400 shrink-0" /> Otomatik güncelleme — onaylı kurulum</li>
            </ul>
          </div>
        </div>
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
          ...((resellerData || []) as ResellerRow[]).map((r) => ({ id: `r-${r.id}`, company_name: r.company_name, contact_name: r.contact_name, phone: r.phone, email: r.email, notes: r.notes })),
          ...((appData || []) as { id: string; company_name: string; contact_name?: string; phone?: string; email?: string; city?: string }[]).map((a) => ({ id: `a-${a.id}`, company_name: a.company_name, contact_name: a.contact_name, phone: a.phone, email: a.email, notes: a.city || '' })),
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
        <div className="max-w-7xl mx-auto px-4 text-center">
          <Building2 className="w-14 h-14 mx-auto mb-4 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-black mb-4">Bayi & çözüm ortağı programı</h1>
          <p className="text-lg text-orange-50 max-w-2xl mx-auto">Yüksek komisyon, haftalık ödeme ve teknik destek hattı.</p>
        </div>
      </section>
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-3 gap-6">
          {RESELLER_TIERS.map((tier) => (
            <div key={tier.title} className={`rounded-2xl border p-6 ${tier.highlight ? 'border-orange-500 bg-orange-50' : 'border-slate-200'}`}>
              <h2 className="text-xl font-black">{tier.title}</h2>
              <p className="text-3xl font-black text-orange-600 my-2">{tier.commission}</p>
              <p className="text-sm text-slate-500 mb-4">{tier.volume}</p>
              <ul className="space-y-2 text-sm">{tier.perks.map((p) => <li key={p} className="flex gap-2"><Check className="w-4 h-4 text-green-600" />{p}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <button type="button" onClick={() => setShowForm(true)} className="bg-orange-600 text-white font-bold px-8 py-4 rounded-xl">Bayi Başvurusu Yap</button>
        </div>
      </section>
      {network.length > 0 && (
        <section className="py-16 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4">
            <SectionHeading title="Bayi ağımız" subtitle="Onaylı iş ortaklarımızdan bazıları." />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {network.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border p-4">
                  <p className="font-bold">{r.company_name}</p>
                  {r.notes && <p className="text-sm text-slate-500">{r.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <ResellerForm onClose={() => setShowForm(false)} />
        </div>
      )}
    </>
  );
}

export function ContactPage({ onLogin }: LandingPageProps) {
  return (
    <>
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-black text-center mb-12">İletişim</h1>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <a href={SITE.phoneTel} className="rounded-2xl border p-6 hover:border-orange-500 transition text-center">
              <Phone className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <p className="font-bold">{SITE.phone}</p>
            </a>
            <a href={`mailto:${SITE.email}`} className="rounded-2xl border p-6 hover:border-orange-500 transition text-center">
              <Mail className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <p className="font-bold">{SITE.email}</p>
            </a>
            <a href={SITE.whatsapp} target="_blank" rel="noreferrer" className="rounded-2xl border p-6 hover:border-orange-500 transition text-center">
              <MessageCircle className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <p className="font-bold">WhatsApp</p>
            </a>
          </div>
          <p className="text-center text-slate-500 mt-8 flex items-center justify-center gap-2"><MapPin className="w-4 h-4" /> {SITE.address}</p>
        </div>
      </section>
      <CTABand title="Demo randevusu" subtitle="İşletmenize özel 30 dakikalık tanıtım." onPrimary={onLogin} onSecondary={() => { window.location.href = SITE.whatsapp; }} secondaryLabel="WhatsApp" />
    </>
  );
}
