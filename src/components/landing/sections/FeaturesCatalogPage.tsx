import { useCallback, useState } from 'react';
import {
  ArrowRight,
  Check,
  Printer,
  Share2,
  ChevronRight,
  Phone,
} from 'lucide-react';
import type { LandingPageProps } from '../pages/LandingPages';
import { CATALOG_INTRO, CATALOG_STATS } from '../content/featureCatalog';
import { COMPARISON_ROWS, SITE } from '../content/siteContent';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';
import { SefposPresentation } from '../components/SefposPresentation';
import { FeaturesCatalogBrochure } from './FeaturesCatalogBrochure';
import { BrandLogo } from '../components/BrandLogo';

export function FeaturesCatalogPage({ onLogin, onNavigate }: LandingPageProps) {
  const [highlightModule, setHighlightModule] = useState<string | null>(null);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/ozellikler`;
    const text = `${SITE.name} — kurumsal özellik kataloğu`;
    try {
      if (navigator.share) {
        await navigator.share({ title: CATALOG_INTRO.title, text, url });
        return;
      }
    } catch {
      /* iptal */
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Katalog linki kopyalandı.');
    } catch {
      prompt('Bu linki paylaşın:', url);
    }
  }, []);

  return (
    <div className="landing-features-catalog">
      <section className="relative overflow-hidden bg-slate-950 text-white py-16 md:py-22 print:py-8 print:bg-white print:text-slate-900">
        <div className="absolute inset-0 landing-hero-glow opacity-80" aria-hidden />
        <div className="absolute top-0 right-0 w-[min(520px,90vw)] h-[min(520px,70vh)] bg-red-900/25 blur-[120px] rounded-full" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10">
            <div className="max-w-2xl">
              <div className="flex items-center gap-4 mb-6">
                <BrandLogo size="lg" onDark />
                <span className="hidden sm:block h-10 w-px bg-white/15" />
                <p className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400">
                  Kurumsal katalog 2026
                </p>
              </div>
              <h1 className="text-3xl md:text-5xl font-black leading-tight mb-4">{CATALOG_INTRO.title}</h1>
              <p className="text-lg text-slate-300 leading-relaxed mb-4 print:text-slate-700">{CATALOG_INTRO.subtitle}</p>
              <p className="text-base text-slate-400 leading-relaxed mb-8 print:text-slate-600">{CATALOG_INTRO.pitch}</p>
              <div className="flex flex-wrap gap-3 print:hidden">
                <button type="button" onClick={onLogin} className="landing-btn-primary">
                  Ücretsiz dene <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href={SITE.phoneTel}
                  className="landing-btn-outline border-white/30 text-white hover:bg-white/10 inline-flex items-center gap-2"
                >
                  <Phone className="w-5 h-5" /> {SITE.phone}
                </a>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="text-sm font-semibold text-slate-400 hover:text-white px-3 py-2 inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> PDF / Yazdır
                </button>
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="text-sm font-semibold text-slate-400 hover:text-white px-3 py-2 inline-flex items-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" /> Paylaş
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 shrink-0 w-full max-w-md lg:max-w-sm print:hidden">
              {CATALOG_STATS.map((s) => (
                <div key={s.label} className="landing-stat-pill text-center">
                  <p className="text-2xl font-black text-orange-400 tabular-nums">{s.value}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden print:block text-sm text-slate-600 mt-6">
            {SITE.phone} · {SITE.email} · www.sefpos.com.tr
          </div>
        </div>
      </section>

      <SefposPresentation onModuleSelect={setHighlightModule} />
      <FeaturesCatalogBrochure highlightId={highlightModule} />

      <section className="py-16 bg-slate-900 text-white print:bg-slate-100 print:text-slate-900">
        <div className="max-w-5xl mx-auto px-4">
          <SectionHeading
            light
            eyebrow="Karşılaştırma"
            title="Market POS veya genel yazılıma göre"
            subtitle="Restoran işine özel olduğumuz noktalar."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-700 print:border-slate-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-orange-600 to-red-800 print:bg-orange-600">
                  <th className="text-left p-4 font-bold">Konu</th>
                  <th className="p-4 font-bold">ŞefPOS</th>
                  <th className="p-4 font-bold text-slate-300 print:text-white/80">Genel çözüm</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={row.label}
                    className={
                      i % 2 === 0
                        ? 'bg-slate-800/50 print:bg-white'
                        : 'bg-slate-800/30 print:bg-slate-50'
                    }
                  >
                    <td className="p-4 font-medium">{row.label}</td>
                    <td className="p-4 text-center">
                      {row.sefpos === true ? (
                        <Check className="w-5 h-5 text-green-400 mx-auto print:text-green-600" />
                      ) : (
                        String(row.sefpos)
                      )}
                    </td>
                    <td className="p-4 text-center text-slate-400 print:text-slate-600">
                      {row.generic === true ? (
                        <Check className="w-5 h-5 mx-auto" />
                      ) : row.generic === false ? (
                        <span className="text-red-400 print:text-red-600">—</span>
                      ) : (
                        row.generic
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="print:hidden">
        <CTABand
          title="Canlı demo görmek ister misiniz?"
          subtitle="İşletmenize özel ekran turu ve fiyat teklifi için bizi arayın."
          onPrimary={onLogin}
          onSecondary={() => onNavigate('/iletisim')}
          secondaryLabel="İletişim"
        />
        <section className="py-8 bg-slate-50 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="font-bold text-orange-600 hover:text-red-700 inline-flex items-center gap-1"
            >
              Ana sayfaya dön <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
