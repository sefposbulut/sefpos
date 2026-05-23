import { useCallback } from 'react';
import {
  ArrowRight,
  Check,
  Printer,
  Share2,
  ChevronRight,
} from 'lucide-react';
import type { LandingPageProps } from '../pages/LandingPages';
import {
  CATALOG_INTRO,
  FEATURE_CATALOG,
  SALES_HIGHLIGHTS,
} from '../content/featureCatalog';
import { COMPARISON_ROWS, SITE } from '../content/siteContent';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';

export function FeaturesCatalogPage({ onLogin, onNavigate }: LandingPageProps) {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/ozellikler`;
    const text = `${SITE.name} özellik kataloğu — restoran adisyon, paket ve online sipariş`;
    try {
      if (navigator.share) {
        await navigator.share({ title: CATALOG_INTRO.title, text, url });
        return;
      }
    } catch {
      /* kullanıcı iptal */
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Katalog linki panoya kopyalandı.');
    } catch {
      prompt('Bu linki paylaşın:', url);
    }
  }, []);

  return (
    <div className="landing-features-catalog">
      {/* Hero — ekranda görünür; yazdırmada sade */}
      <section className="bg-slate-950 text-white py-16 md:py-24 print:py-8 print:bg-white print:text-slate-900">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400 print:text-orange-700 mb-3">
            Kurumsal katalog · v2026
          </p>
          <h1 className="text-3xl md:text-5xl font-black leading-tight mb-4 max-w-3xl">
            {CATALOG_INTRO.title}
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl leading-relaxed mb-6 print:text-slate-700">
            {CATALOG_INTRO.subtitle}
          </p>
          <p className="text-sm text-slate-400 max-w-3xl leading-relaxed mb-8 print:text-slate-600">
            {CATALOG_INTRO.pitch}
          </p>
          <div className="flex flex-wrap gap-3 print:hidden">
            <button type="button" onClick={onLogin} className="landing-btn-primary">
              Ücretsiz Dene <ArrowRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="landing-btn-outline border-white/30 text-white hover:bg-white/10"
            >
              <Printer className="w-5 h-5" /> PDF / Yazdır
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="landing-btn-outline border-white/30 text-white hover:bg-white/10"
            >
              <Share2 className="w-5 h-5" /> Linki paylaş
            </button>
          </div>
          <div className="hidden print:block text-sm text-slate-600 mt-4">
            {SITE.phone} · {SITE.email} · {SITE.name}
          </div>
        </div>
      </section>

      {/* Hızlı navigasyon */}
      <nav className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-2 overflow-x-auto">
          <ul className="flex gap-2 min-w-max">
            {FEATURE_CATALOG.map((cat) => (
              <li key={cat.id}>
                <a
                  href={`#${cat.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 bg-slate-100 hover:bg-orange-100 hover:text-orange-800 transition"
                >
                  <cat.icon className="w-3.5 h-3.5" />
                  {cat.title.split(' ')[0]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Satış şeridi */}
      <section className="py-8 bg-orange-50 border-b border-orange-100 print:py-4">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SALES_HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-2 text-sm text-slate-700 bg-white rounded-xl px-3 py-2 border border-orange-100 print:border-slate-200"
              >
                <Icon className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Katalog bölümleri */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 space-y-16 md:space-y-20">
          {FEATURE_CATALOG.map((cat, idx) => (
            <article
              key={cat.id}
              id={cat.id}
              className="scroll-mt-24 print:break-inside-avoid-page"
            >
              <div className="flex flex-col md:flex-row md:items-start gap-6 mb-6">
                <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center shadow-lg shadow-orange-500/20 print:shadow-none">
                  <cat.icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-400 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    {cat.badge && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                        {cat.badge}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">{cat.title}</h2>
                  <p className="text-slate-600 leading-relaxed max-w-3xl">{cat.lead}</p>
                </div>
              </div>
              <ul className="grid sm:grid-cols-2 gap-3">
                {cat.bullets.map((b) => (
                  <li
                    key={b.title}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 hover:border-orange-200 hover:bg-white transition print:bg-white"
                  >
                    <h3 className="font-bold text-slate-900 text-sm mb-1 flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      {b.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed pl-6">{b.desc}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Karşılaştırma — sunumda güçlü slide */}
      <section className="py-16 bg-slate-900 text-white print:bg-slate-100 print:text-slate-900">
        <div className="max-w-5xl mx-auto px-4">
          <SectionHeading
            light
            eyebrow="Neden ŞefPOS?"
            title="Genel yazılımlara göre"
            subtitle="Müşteri sunumunda öne çıkan farklar."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-700 print:border-slate-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-orange-600 to-red-800 print:bg-orange-600">
                  <th className="text-left p-4 font-bold">Özellik</th>
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
          title="Canlı demo ve teklif"
          subtitle="Bu kataloğu müşterinizle paylaşın; kurulum için bizimle iletişime geçin."
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
