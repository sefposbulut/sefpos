import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { FeatureCategory } from '../content/featureCatalog';
import { FEATURE_CATALOG } from '../content/featureCatalog';
import { FeatureModuleShowcase } from './FeatureModuleShowcase';

type Props = {
  module: FeatureCategory;
  onBack: () => void;
  onSelectModule: (id: string) => void;
  onLogin?: () => void;
};

export function FeatureModuleFullPage({ module, onBack, onSelectModule, onLogin }: Props) {
  const idx = FEATURE_CATALOG.findIndex((c) => c.id === module.id);
  const prev = idx > 0 ? FEATURE_CATALOG[idx - 1]! : null;
  const next = idx < FEATURE_CATALOG.length - 1 ? FEATURE_CATALOG[idx + 1]! : null;
  const Icon = module.icon;

  return (
    <article className="landing-feature-fullpage print:hidden" id={`katalog-${module.id}`}>
      <div className="sticky top-16 md:top-20 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-orange-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Tüm özellikler
          </button>
          <div className="flex items-center gap-2">
            {prev && (
              <button
                type="button"
                onClick={() => onSelectModule(prev.id)}
                className="landing-feature-fullpage-nav"
                aria-label={`Önceki: ${prev.menuLabel}`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{prev.menuLabel}</span>
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={() => onSelectModule(next.id)}
                className="landing-feature-fullpage-nav"
                aria-label={`Sonraki: ${next.menuLabel}`}
              >
                <span className="hidden sm:inline">{next.menuLabel}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="landing-feature-fullpage-hero">
        <FeatureModuleShowcase module={module} fullPage />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 md:py-14">
        <header className="mb-8 md:mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="landing-feature-row-icon is-large shrink-0">
              <Icon className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-orange-600">{module.menuLabel}</p>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-black text-slate-900 leading-tight mb-4">
            {module.title}
          </h2>
          <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-3xl">{module.lead}</p>
        </header>

        <section className="rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-red-800 text-white p-6 md:p-8 mb-10 shadow-xl shadow-orange-500/20">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-100 mb-3">ŞefPOS ile</p>
          <p className="text-lg md:text-xl leading-relaxed font-medium">{module.pitch}</p>
          <ul className="mt-6 grid sm:grid-cols-3 gap-3">
            {module.highlights.map((h) => (
              <li
                key={h}
                className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-sm font-semibold leading-snug backdrop-blur-sm"
              >
                {h}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 mb-2">
            Bu modülde neler var?
          </h3>
          <p className="text-slate-600 mb-6 max-w-2xl">
            Aşağıdaki işlevlerin tamamı ŞefPOS&apos;ta hazır; ek modül veya ayrı program gerekmez.
          </p>
          <ul className="grid md:grid-cols-2 gap-4">
            {module.bullets.map((b) => (
              <li
                key={b.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-orange-200 hover:shadow-md transition"
              >
                <h4 className="font-bold text-slate-900 text-base mb-2 flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  {b.title}
                </h4>
                <p className="text-slate-600 text-sm md:text-base leading-relaxed pl-7">{b.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {module.outro && (
          <p className="mt-10 text-center text-slate-500 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            {module.outro}
          </p>
        )}

        <div className="mt-12 flex flex-col sm:flex-row flex-wrap justify-center gap-3 border-t border-slate-200 pt-10">
          {onLogin && (
            <button type="button" onClick={onLogin} className="landing-btn-primary">
              Ücretsiz dene <ArrowRight className="w-5 h-5" />
            </button>
          )}
          <button type="button" onClick={onBack} className="landing-btn-outline border-slate-300 text-slate-800">
            <ArrowLeft className="w-5 h-5" /> Özellik listesine dön
          </button>
          {next && (
            <button
              type="button"
              onClick={() => onSelectModule(next.id)}
              className="landing-btn-outline border-slate-300 text-slate-800"
            >
              Sonraki: {next.menuLabel} <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
