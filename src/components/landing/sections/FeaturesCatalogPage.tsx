import { useCallback, useEffect, useState } from 'react';
import { FEATURE_CATALOG } from '../content/featureCatalog';
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
import { FeaturesCatalogBrochure } from './FeaturesCatalogBrochure';
import { BrandLogo } from '../components/BrandLogo';

function hasFeatureHash(): boolean {
  const id = window.location.hash.replace(/^#/, '');
  return FEATURE_CATALOG.some((c) => c.id === id);
}

export function FeaturesCatalogPage({ onLogin, onNavigate }: LandingPageProps) {
  const [detailOpen, setDetailOpen] = useState(() =>
    typeof window !== 'undefined' ? hasFeatureHash() : false,
  );

  useEffect(() => {
    const sync = () => setDetailOpen(hasFeatureHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('sefpos-navigate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('sefpos-navigate', sync);
    };
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/ozellikler`;
    const text = `${SITE.name} — özellikler`;
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
      alert('Link kopyalandı.');
    } catch {
      prompt('Bu linki paylaşın:', url);
    }
  }, []);

  return (
    <div className="landing-features-catalog">
      {!detailOpen && (
      <section className="relative overflow-hidden bg-slate-950 text-white py-12 md:py-16 print:py-8 print:bg-white print:text-slate-900">
        <div className="absolute inset-0 landing-hero-glow opacity-60" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-5">
            <BrandLogo size="md" onDark />
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">Özellikler</p>
          </div>
          <h1 className="text-3xl md:text-4xl font-black leading-tight mb-3">{CATALOG_INTRO.title}</h1>
          <p className="text-slate-300 leading-relaxed mb-6 print:text-slate-700">{CATALOG_INTRO.subtitle}</p>
          <div className="flex flex-wrap gap-2 mb-6 print:hidden">
            {CATALOG_STATS.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-baseline gap-1.5 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs"
              >
                <span className="font-black text-orange-400 tabular-nums">{s.value}</span>
                <span className="text-slate-400 font-medium">{s.label}</span>
              </span>
            ))}
          </div>
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
          <div className="hidden print:block text-sm text-slate-600 mt-4">
            {SITE.phone} · {SITE.email} · www.sefpos.com.tr
          </div>
        </div>
      </section>
      )}

      <FeaturesCatalogBrochure onDetailOpen={setDetailOpen} onLogin={onLogin} />

      {!detailOpen && (
      <section className="py-14 bg-slate-900 text-white print:bg-slate-100 print:text-slate-900">
        <div className="max-w-4xl mx-auto px-4">
          <SectionHeading
            light
            eyebrow="Karşılaştırma"
            title="Genel POS’a göre"
            subtitle="Restoran işine özel farklar."
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
      )}

      <div className="print:hidden">
        {!detailOpen && (
        <CTABand
          title="Canlı demo görmek ister misiniz?"
          subtitle="İşletmenize özel ekran turu için bizi arayın."
          onPrimary={onLogin}
          onSecondary={() => onNavigate('/iletisim')}
          secondaryLabel="İletişim"
        />
        )}
        <section className="py-8 bg-slate-50 border-t border-slate-200">
          <div className="max-w-4xl mx-auto px-4 text-center">
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
