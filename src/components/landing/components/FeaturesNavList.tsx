import { ArrowRight } from 'lucide-react';
import { FEATURE_CATALOG } from '../content/featureCatalog';

type FeaturesNavListProps = {
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Üst menü mega paneli — daha kompakt satırlar */
  compact?: boolean;
};

/** İkon + modül adı, iki sütun — ŞefPOS marka stilleri */
export function FeaturesNavList({ activeId, onSelect, compact = false }: FeaturesNavListProps) {
  return (
    <ul
      className={`grid grid-cols-1 sm:grid-cols-2 gap-0.5 ${compact ? 'gap-0' : 'gap-1'}`}
      role="list"
    >
      {FEATURE_CATALOG.map((cat) => {
        const isActive = activeId === cat.id;
        return (
          <li key={cat.id}>
            <button
              type="button"
              role="listitem"
              aria-current={isActive ? 'true' : undefined}
              onClick={() => onSelect(cat.id)}
              className={`landing-feature-row group w-full ${isActive ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`}
            >
              <span className="landing-feature-row-icon" aria-hidden>
                <cat.icon className={compact ? 'w-[18px] h-[18px]' : 'w-5 h-5'} strokeWidth={1.75} />
              </span>
              <span className="landing-feature-row-text">{cat.menuLabel}</span>
              {!compact && (
                <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0 opacity-0 -translate-x-1 transition group-hover:opacity-40 landing-feature-row-arrow" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
