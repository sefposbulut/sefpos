import type { FeatureCategory } from '../content/featureCatalog';
import { HeroDashboard } from './HeroDashboard';
import { IntegrationMarquee } from './IntegrationMarquee';
import { FeatureModuleScene } from './FeatureModuleScene';

type Props = {
  module: FeatureCategory;
  fullPage?: boolean;
};

/** Modüle özel tanıtım görseli — gerçek salon mockup, platformlar veya ŞefPOS UI sahnesi */
export function FeatureModuleShowcase({ module, fullPage = false }: Props) {
  const wrap = fullPage ? 'landing-module-hero-full' : 'landing-module-showcase';

  if (module.visual === 'hero-dashboard') {
    return (
      <div className={`${wrap} landing-module-showcase-mockup`}>
        <div className={fullPage ? 'landing-module-mockup-frame' : ''}>
          <HeroDashboard />
        </div>
        {fullPage && (
          <p className="text-center text-xs text-slate-400 mt-3 max-w-lg mx-auto">
            Canlı masa haritası — ŞefPOS salon ekranı
          </p>
        )}
      </div>
    );
  }

  if (module.visual === 'platforms') {
    return (
      <div className={`${wrap} landing-module-showcase-platforms`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-3 text-center">
          Entegre online platformlar — tek merkez
        </p>
        <IntegrationMarquee />
        {fullPage && (
          <p className="text-center text-xs text-slate-400 mt-3">
            Getir, Yemeksepeti, Trendyol, Migros, HemenYolda siparişleri ŞefPOS&apos;a düşer
          </p>
        )}
      </div>
    );
  }

  return <FeatureModuleScene module={module} fullPage={fullPage} />;
}
