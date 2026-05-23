import { useEffect, useState } from 'react';
import { Check, Layers } from 'lucide-react';
import {
  CATALOG_STATS,
  FEATURE_CATALOG,
  getCatalogFeatureCount,
} from '../content/featureCatalog';
import { INTEGRATIONS, SITE } from '../content/siteContent';
import { IntegrationMarquee } from '../components/IntegrationMarquee';
import { PlatformLogo } from '../../PlatformLogo';

type FeaturesCatalogBrochureProps = {
  /** Sunum slaytından seçilen modül — ilgili bölüme vurgu */
  highlightId?: string | null;
};

export function FeaturesCatalogBrochure({ highlightId }: FeaturesCatalogBrochureProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const totalFeatures = getCatalogFeatureCount();

  useEffect(() => {
    if (!highlightId) return;
    setActiveId(highlightId);
    const el = document.getElementById(`katalog-${highlightId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = window.setTimeout(() => setActiveId(null), 2400);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  return (
    <section id="katalog" className="landing-catalog-brochure bg-slate-100/80 border-t border-slate-200">
      {/* Kapak şeridi */}
      <div className="landing-catalog-cover">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-16">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-orange-300 mb-3">
                Kurumsal özellik kataloğu
              </p>
              <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-3">
                Tüm modüller, tek broşür
              </h2>
              <p className="text-slate-300 leading-relaxed">
                Müşteri sunumunda veya yazdırılmış PDF&apos;de kullanın. Her bölüm gerçek ŞefPOS işlevlerini
                işletme dilinde özetler — teknik jargon yok.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              {CATALOG_STATS.map((s) => (
                <div key={s.label} className="landing-catalog-stat">
                  <p className="text-2xl md:text-3xl font-black text-orange-400 tabular-nums">{s.value}</p>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Platform şeridi */}
      <div className="bg-white border-b border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            Entegre online platformlar
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            {INTEGRATIONS.map((int) => (
              <div
                key={int.code}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2"
              >
                <PlatformLogo code={int.code} name={int.name} size="sm" />
                <span className="text-xs font-bold text-slate-700">{int.name}</span>
              </div>
            ))}
          </div>
          <IntegrationMarquee />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12 md:py-16">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 xl:grid-cols-[240px_1fr]">
          {/* İçindekiler — masaüstü */}
          <aside className="hidden lg:block print:hidden">
            <nav className="landing-catalog-toc sticky top-24" aria-label="Katalog içindekiler">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> İçindekiler
              </p>
              <ol className="space-y-0.5">
                {FEATURE_CATALOG.map((cat, idx) => (
                  <li key={cat.id}>
                    <a
                      href={`#katalog-${cat.id}`}
                      className="landing-catalog-toc-link group"
                    >
                      <span className="text-slate-400 tabular-nums text-xs font-bold w-6">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <cat.icon className="w-3.5 h-3.5 text-orange-600 shrink-0 opacity-80 group-hover:opacity-100" />
                      <span className="truncate">{cat.shortLabel}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <p className="mt-4 pt-4 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                Toplam <strong className="text-slate-800">{totalFeatures}</strong> işlev · {SITE.phone}
              </p>
            </nav>
          </aside>

          <div className="min-w-0 space-y-8">
            {/* Mobil modül ızgarası */}
            <div className="lg:hidden print:hidden grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {FEATURE_CATALOG.map((cat) => (
                <a
                  key={cat.id}
                  href={`#katalog-${cat.id}`}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:border-orange-300 hover:bg-orange-50/50 transition"
                >
                  <cat.icon className="w-4 h-4 text-orange-600 shrink-0" />
                  {cat.shortLabel}
                </a>
              ))}
            </div>

            {/* Modül sayfaları */}
            {FEATURE_CATALOG.map((cat, idx) => (
              <article
                key={cat.id}
                id={`katalog-${cat.id}`}
                className={`landing-catalog-chapter scroll-mt-28 print:break-inside-avoid-page ${
                  activeId === cat.id ? 'is-highlighted' : ''
                } ${idx % 2 === 1 ? 'is-alt' : ''}`}
              >
                <header className="landing-catalog-chapter-head">
                  <div className="landing-catalog-chapter-badge">
                    <span className="text-4xl font-black text-white/20 tabular-nums leading-none">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
                      <cat.icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-200 mb-1">
                      {cat.shortLabel} · {cat.bullets.length} işlev
                    </p>
                    <h3 className="text-xl md:text-2xl font-black text-white leading-snug">{cat.title}</h3>
                    <p className="text-white/85 text-sm md:text-base leading-relaxed mt-2 max-w-3xl">{cat.lead}</p>
                  </div>
                </header>
                <div className="landing-catalog-chapter-body">
                  <ul className="grid sm:grid-cols-2 gap-3">
                    {cat.bullets.map((b) => (
                      <li key={b.title} className="landing-catalog-feature-card">
                        <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          {b.title}
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed pl-6">{b.desc}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
