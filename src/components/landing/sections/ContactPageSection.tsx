import {
  ArrowRight,
  Building2,
  Clock,
  Download,
  ExternalLink,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Store,
} from 'lucide-react';
import type { LandingPageProps } from '../pages/LandingPages';
import {
  SITE,
  CONTACT_CHANNELS,
  CONTACT_HOURS,
  CONTACT_SUPPORT_TOPICS,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
} from '../content/siteContent';
import { WINDOWS_SETUP_FILENAME, windowsSetupDownloadHref } from '../../../lib/desktopDownload';
import { CTABand } from '../components/CTABand';
import { BrandLogo } from '../components/BrandLogo';

const CHANNEL_ICONS = {
  phone: Phone,
  email: Mail,
  whatsapp: MessageCircle,
} as const;

export function ContactPageSection({ onLogin, onNavigate }: LandingPageProps) {
  const mapsEmbed = googleMapsEmbedUrl();
  const mapsOpen = googleMapsSearchUrl();

  return (
    <>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 landing-hero-glow opacity-50" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 py-14 md:py-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-400 mb-3">
                İletişim
              </p>
              <h1 className="text-3xl md:text-5xl font-black leading-tight mb-4">
                {SITE.companyName}
              </h1>
              <p className="text-lg text-slate-300 leading-relaxed">
                Merkez ofisimiz Turgutlu&apos;da; Türkiye genelinde restoran, cafe ve paket servis
                işletmelerine kurulum, eğitim ve teknik destek sunuyoruz.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <BrandLogo size="lg" onDark />
              <div className="text-sm">
                <p className="font-black text-white">{SITE.name}</p>
                <p className="text-slate-400">{SITE.tagline}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-10 items-start">
            {/* Sol — iletişim kanalları */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-11 h-11 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Merkez ofis</h2>
                    <p className="text-sm font-bold text-orange-600 mt-0.5">{SITE.companyName}</p>
                  </div>
                </div>
                <address className="not-italic text-slate-700 leading-relaxed space-y-1 mb-6">
                  <p className="font-semibold text-slate-900">{SITE.addressLine}</p>
                  <p>{SITE.addressCity}</p>
                  <p className="text-slate-500">Türkiye</p>
                </address>
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="font-medium">{CONTACT_HOURS}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-1 gap-3">
                {CONTACT_CHANNELS.map((ch) => {
                  const Icon = CHANNEL_ICONS[ch.id as keyof typeof CHANNEL_ICONS];
                  return (
                    <a
                      key={ch.id}
                      href={ch.href}
                      target={'external' in ch && ch.external ? '_blank' : undefined}
                      rel={'external' in ch && ch.external ? 'noreferrer' : undefined}
                      className="group flex items-center gap-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-orange-300 hover:shadow-md transition"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shrink-0 shadow-md shadow-orange-500/20">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{ch.label}</p>
                        <p className="font-black text-slate-900 truncate">{ch.value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{ch.hint}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 transition shrink-0" />
                    </a>
                  );
                })}
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8">
                <div className="flex items-center gap-2 mb-4">
                  <Headphones className="w-5 h-5 text-orange-600" />
                  <h3 className="font-black text-slate-900">Size nasıl yardımcı olabiliriz?</h3>
                </div>
                <ul className="space-y-2.5">
                  {CONTACT_SUPPORT_TOPICS.map((topic) => (
                    <li key={topic} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                      {topic}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Sağ — harita */}
            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 md:p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-orange-600" />
                    <h2 className="font-black text-slate-900">Konum</h2>
                  </div>
                  <a
                    href={mapsOpen}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 hover:text-red-700 transition"
                  >
                    Google Haritalar&apos;da aç
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <div className="relative aspect-[4/3] min-h-[280px] bg-slate-100">
                  <iframe
                    title={`${SITE.companyName} — ${SITE.address}`}
                    src={mapsEmbed}
                    className="absolute inset-0 w-full h-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
                <div className="p-5 md:p-6 bg-gradient-to-r from-orange-50 to-amber-50/80 border-t border-orange-100">
                  <p className="text-sm font-bold text-slate-800 mb-1">Yol tarifi</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {SITE.addressLine}, {SITE.addressCity}. Randevulu ziyaret için lütfen önce telefon
                    veya WhatsApp ile haber verin.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onLogin}
                  className="landing-btn-primary justify-center py-4 rounded-2xl text-base"
                >
                  Ücretsiz dene <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href={windowsSetupDownloadHref()}
                  download={WINDOWS_SETUP_FILENAME}
                  className="landing-btn-outline border-slate-300 text-slate-800 justify-center py-4 rounded-2xl text-base inline-flex items-center gap-2"
                >
                  <Download className="w-5 h-5" /> Windows indir
                </a>
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigate('/bayi')}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:border-orange-300 transition flex items-center justify-center gap-2"
                    >
                      <Store className="w-5 h-5 text-orange-600" /> Bayi programı
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('/fiyatlar')}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 hover:border-orange-300 transition flex items-center justify-center gap-2"
                    >
                      Fiyatlandırma <ArrowRight className="w-5 h-5 text-orange-600" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CTABand
        title="Demo randevusu alın"
        subtitle="İşletmenize özel 30 dakikalık tanıtım — uzaktan veya yerinde."
        onPrimary={onLogin}
        onSecondary={() => {
          window.location.href = SITE.whatsapp;
        }}
        secondaryLabel="WhatsApp ile yazın"
      />
    </>
  );
}
