import { ChevronRight } from 'lucide-react';
import { FEATURE_CATALOG } from '../content/featureCatalog';
import { FeatureModuleShowcase } from './FeatureModuleShowcase';

type Props = {
  onSelect: (id: string) => void;
};

/** Özellik seçim ızgarası — tıklanınca tam sayfa tanıtım */
export function FeatureModuleGrid({ onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {FEATURE_CATALOG.map((cat, idx) => {
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className="landing-feature-grid-card group text-left overflow-hidden"
          >
            <div className="landing-feature-grid-preview" aria-hidden>
              <FeatureModuleShowcase module={cat} />
            </div>
            <span className="text-xs font-bold text-slate-400 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
            <span className="landing-feature-row-icon mt-3 mb-3">
              <Icon className="w-6 h-6" strokeWidth={1.75} />
            </span>
            <h3 className="font-black text-slate-900 text-base leading-snug mb-2 group-hover:text-orange-700 transition">
              {cat.menuLabel}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed line-clamp-3 flex-1">{cat.lead}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-orange-600">
              Tanıtımı aç
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
