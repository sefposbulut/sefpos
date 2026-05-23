import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, ArrowDown } from 'lucide-react';
import {
  PRESENTATION_SLIDES,
  getCatalogModuleById,
  type PresentationSlide,
} from '../content/featureCatalog';
import { HeroDashboard } from './HeroDashboard';
import { IntegrationMarquee } from './IntegrationMarquee';
import { BrandLogo } from './BrandLogo';

const AUTO_MS = 11000;

type SefposPresentationProps = {
  onModuleSelect?: (catalogId: string) => void;
};

function SlideVisual({ slide }: { slide: PresentationSlide }) {
  if (slide.image) {
    return (
      <div className="landing-presentation-photo-wrap">
        <img
          src={slide.image}
          alt={slide.imageAlt ?? slide.title}
          className="landing-presentation-photo"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  if (slide.visual === 'hero-dashboard') {
    return (
      <div className="landing-presentation-mockup">
        <HeroDashboard />
      </div>
    );
  }

  if (slide.visual === 'platforms') {
    return (
      <div className="landing-presentation-platforms rounded-2xl p-3 bg-slate-900/50">
        <IntegrationMarquee />
      </div>
    );
  }

  const mod = slide.catalogId ? getCatalogModuleById(slide.catalogId) : null;
  if (mod) {
    const Icon = mod.icon;
    return (
      <div className="landing-presentation-module-visual">
        <div className="landing-presentation-module-ring" aria-hidden />
        <Icon className="w-20 h-20 md:w-28 md:h-28 text-orange-400 relative z-10" strokeWidth={1.25} />
        <p className="relative z-10 mt-4 text-sm font-bold uppercase tracking-[0.2em] text-orange-300/90">
          {mod.shortLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="landing-presentation-brand flex items-center justify-center h-full min-h-[280px]">
      <BrandLogo size="xl" />
    </div>
  );
}

export function SefposPresentation({ onModuleSelect }: SefposPresentationProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = PRESENTATION_SLIDES.length;
  const slide = PRESENTATION_SLIDES[index]!;
  const progress = ((index + 1) / total) * 100;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + total) % total);
    },
    [total],
  );

  const goTo = useCallback((i: number) => {
    setIndex(i);
  }, []);

  useEffect(() => {
    if (paused || total <= 1) return;
    const t = window.setInterval(() => go(1), AUTO_MS);
    return () => window.clearInterval(t);
  }, [paused, go, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const scrollToDetail = () => {
    if (slide.catalogId) {
      onModuleSelect?.(slide.catalogId);
      return;
    }
    document.getElementById('katalog')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="landing-presentation print:hidden" aria-label="ŞefPOS tanıtım sunumu">
      <div className="max-w-7xl mx-auto px-4 py-10 md:py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-orange-600 mb-2">
              Canlı sunum modu
            </p>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900">
              {total} slayt · tüm modüller
            </h2>
            <p className="text-slate-600 text-sm mt-1 max-w-xl">
              Ok tuşları veya alttaki küçük resimlerle gezin. Detaylı katalog aşağıda.
            </p>
          </div>
          <p className="text-sm font-bold text-slate-500 tabular-nums">
            <span className="text-orange-600 text-lg">{String(index + 1).padStart(2, '0')}</span>
            <span className="mx-1 text-slate-300">/</span>
            {String(total).padStart(2, '0')}
          </p>
        </div>

        <div className="landing-presentation-progress mb-3" aria-hidden>
          <div className="landing-presentation-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div
          className="landing-presentation-stage landing-presentation-stage-pro"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="landing-presentation-grid">
            <div className="landing-presentation-visual-col" key={`vis-${slide.id}`}>
              <SlideVisual slide={slide} />
            </div>
            <div className="landing-presentation-copy">
              {slide.eyebrow && (
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-2">{slide.eyebrow}</p>
              )}
              <h3 className="text-2xl md:text-[2rem] font-black text-slate-900 leading-tight mb-3">{slide.title}</h3>
              <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-5">{slide.subtitle}</p>
              {slide.bullets && slide.bullets.length > 0 && (
                <ul className="grid sm:grid-cols-2 gap-2 mb-6">
                  {slide.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"
                    >
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                      <span className="leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={scrollToDetail}
                className="landing-link-more text-sm"
              >
                {slide.catalogId ? 'Katalogda bu modülü aç' : 'Tam kataloğa git'}
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="landing-presentation-controls">
            <button type="button" className="landing-presentation-nav" onClick={() => go(-1)} aria-label="Önceki">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="landing-presentation-nav"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Oynat' : 'Duraklat'}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button type="button" className="landing-presentation-nav" onClick={() => go(1)} aria-label="Sonraki">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Film şeridi */}
        <div className="landing-presentation-filmstrip mt-4" role="tablist" aria-label="Sunum slaytları">
          {PRESENTATION_SLIDES.map((s, i) => {
            const mod = s.catalogId ? getCatalogModuleById(s.catalogId) : null;
            const Icon = mod?.icon;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`landing-presentation-thumb ${i === index ? 'is-active' : ''}`}
                onClick={() => goTo(i)}
              >
                {Icon ? (
                  <Icon className="w-4 h-4 shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-orange-500 shrink-0" />
                )}
                <span className="truncate">{s.eyebrow ?? 'Giriş'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
