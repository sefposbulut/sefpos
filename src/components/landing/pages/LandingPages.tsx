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
  Smartphone,
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
  INTEGRATIONS,
  PRICING_PLANS,
  FAQ_ITEMS,
  RESELLER_TIERS,
} from '../content/siteContent';
import { PlatformLogo } from '../../PlatformLogo';
import { IntegrationMarquee } from '../components/IntegrationMarquee';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';
import { PricingPlanCard } from '../components/PricingPlanCard';
import { ResellerForm } from '../components/ResellerForm';
import { TurkeyResellerMap } from '../components/TurkeyResellerMap';
import { HomeRichPage } from '../sections/HomeRichSections';
import { FeaturesCatalogPage } from '../sections/FeaturesCatalogPage';
import { ContactPageSection } from '../sections/ContactPageSection';
import { APP_VERSION } from '../../../lib/appVersion';
import {
  GARSON_APK_DOWNLOAD_PATH,
  GARSON_APK_FILENAME,
  GARSON_APP_STORE_URL,
  garsonApkDownloadHref,
  onWindowsSetupDownloadClick,
  windowsSetupDownloadHref,
} from '../../../lib/desktopDownload';

function AppStoreGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.65c.02 2.2 1.93 2.93 1.95 2.94-.02.05-.3 1.04-.99 2.06-.6.88-1.22 1.75-2.2 1.77-.96.02-1.27-.57-2.37-.57s-1.44.55-2.35.59c-.94.04-1.66-.95-2.27-1.82-1.24-1.79-2.18-5.06-.91-7.27.63-1.1 1.76-1.79 2.99-1.81.93-.02 1.81.63 2.37.63.56 0 1.61-.78 2.71-.66.46.02 1.76.19 2.59 1.41-.07.04-1.55.9-1.52 2.73zM14.7 6.92c.5-.61.84-1.45.75-2.29-.72.03-1.6.48-2.11 1.09-.46.54-.87 1.4-.76 2.22.81.06 1.63-.41 2.12-1.02z" />
    </svg>
  );
}

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

export function FeaturesPage(props: LandingPageProps) {
  return <FeaturesCatalogPage {...props} />;
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
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white py-16 md:py-20">
        <div className="absolute inset-0 landing-hero-glow pointer-events-none opacity-60" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300 mb-3">Paketler</p>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Şeffaf lisans paketleri</h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">
            Modül modül karşılaştırın. Fiyat için bizi arayın — gizli maliyet yok.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading
            align="center"
            eyebrow="Karşılaştırma"
            title="İşletmenize uygun paket"
            subtitle="Başlangıçtan kurumsala — tüm modüller aşağıda listelenir."
          />
          <div className="landing-pricing-grid landing-pricing-grid--modules">
            {PRICING_PLANS.map((plan) => (
              <PricingPlanCard key={plan.name} plan={plan} onCta={onLogin} variant="full" />
            ))}
          </div>
        </div>
      </section>

      <CTABand
        title="Hangi paket size uygun?"
        subtitle="5 dakikalık görüşmeyle netleştirelim."
        onPrimary={() => onNavigate('/iletisim')}
        primaryLabel="Bize Ulaşın"
        onSecondary={onLogin}
        secondaryLabel="Panele Giriş"
      />
    </>
  );
}

export function DownloadPage({ onLogin }: LandingPageProps) {
  const ver = APP_VERSION;
  const [apkReady, setApkReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(GARSON_APK_DOWNLOAD_PATH, { method: 'HEAD', cache: 'no-store' })
      .then((res) => {
        if (cancelled) return;
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        setApkReady(res.status === 200 && !contentType.includes('text/html'));
      })
      .catch(() => {
        if (!cancelled) setApkReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="bg-slate-950 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-black mb-4">Windows masaüstü</h1>
            <p className="text-slate-300 text-lg mb-6">Yazıcı, terazi ve Caller ID için Electron sürümü. Otomatik güncelleme ile her zaman güncel kalın.</p>
            <a
              href={windowsSetupDownloadHref()}
              onClick={onWindowsSetupDownloadClick}
              className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold px-8 py-4 rounded-xl"
            >
              <Download className="w-5 h-5" /> Windows kurulumunu indir
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
      <section className="bg-slate-950 text-white py-16 md:py-20 border-t border-slate-800" aria-labelledby="garson-download-heading">
        <div className="max-w-7xl mx-auto px-4">
          <h2 id="garson-download-heading" className="text-3xl md:text-4xl font-black mb-3">Şefpos Garson</h2>
          <p className="text-slate-300 text-base md:text-lg mb-8 max-w-2xl">
            Garsonlar telefondan masa siparişi alsın. iPhone için App Store, Android için kurulum dosyası.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-700 flex flex-col">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <AppStoreGlyph className="w-5 h-5 text-orange-400 shrink-0" /> iPhone
              </h3>
              <a
                href={GARSON_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-4 rounded-xl text-center"
              >
                <AppStoreGlyph className="w-5 h-5 shrink-0" /> iPhone (App Store)
              </a>
            </div>
            <div className="bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-700 flex flex-col">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-orange-400 shrink-0" /> Android
              </h3>
              {apkReady ? (
                <a
                  href={garsonApkDownloadHref()}
                  download={GARSON_APK_FILENAME}
                  className="inline-flex w-full items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-4 rounded-xl text-center"
                >
                  <Smartphone className="w-5 h-5 shrink-0" /> Android APK indir
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex w-full items-center justify-center gap-2 bg-slate-600 text-slate-300 font-bold px-6 py-4 rounded-xl text-center cursor-not-allowed"
                >
                  <Smartphone className="w-5 h-5 shrink-0" /> Android APK yakında
                </button>
              )}
              <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
                <li>Telefonunuzdan linke dokunup APK&apos;yı indirin.</li>
                <li>Android &apos;Bilinmeyen kaynaklardan yüklemeye izin ver&apos; uyarısında tarayıcınıza izin verin.</li>
                <li>İndirilen dosyayı açıp kurun.</li>
              </ol>
              <p className="text-sm text-slate-400 mt-4">Google Play sürümü yakında.</p>
            </div>
          </div>
          <p className="mt-6 text-sm">
            <a href="/gizlilik-sefpos-garson.html" className="text-orange-300 hover:text-orange-200 underline font-semibold">
              Gizlilik politikası
            </a>
          </p>
        </div>
      </section>
      <CTABand title="Web panelden de kullanın" subtitle="Tarayıcıdan giriş; masaüstü şart değil." onPrimary={onLogin} primaryLabel="Web Girişi" />
    </>
  );
}

export function ResellerPage({ onLogin }: LandingPageProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <section className="bg-gradient-to-br from-orange-600 via-orange-500 to-red-800 text-white py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <Building2 className="w-14 h-14 mx-auto mb-4 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-black mb-4">Bayi & çözüm ortağı programı</h1>
          <p className="text-lg text-orange-50 max-w-2xl mx-auto mb-8">
            Yüksek komisyon, haftalık ödeme ve Türkçe teknik destek — Türkiye genelinde yetkili bayi ağı.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-white text-orange-700 font-bold px-8 py-4 rounded-xl shadow-lg hover:bg-orange-50 transition"
          >
            Bayilik başvurusu yap
          </button>
        </div>
      </section>

      <section className="py-14 md:py-16 landing-dealer-map-section border-b border-orange-100/80">
        <div className="max-w-6xl mx-auto px-4">
          <TurkeyResellerMap onApply={() => setShowForm(true)} />
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
          <button type="button" onClick={() => setShowForm(true)} className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-8 py-4 rounded-xl shadow-md">
            Bayilik başvurusu yap
          </button>
        </div>
      </section>
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <ResellerForm onClose={() => setShowForm(false)} />
        </div>
      )}
    </>
  );
}

export function ContactPage({ onLogin, onNavigate }: LandingPageProps) {
  return <ContactPageSection onLogin={onLogin} onNavigate={onNavigate} />;
}
