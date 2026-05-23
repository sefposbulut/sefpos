import { useCallback, useEffect, useState } from 'react';
import { FEATURE_CATALOG } from '../content/featureCatalog';
import { FeatureModuleGrid } from '../components/FeatureModuleGrid';
import { FeatureModuleFullPage } from '../components/FeatureModuleFullPage';

export const NAV_SYNC_EVENT = 'sefpos-navigate';

function readHashId(): string | null {
  const id = window.location.hash.replace(/^#/, '');
  return FEATURE_CATALOG.some((c) => c.id === id) ? id : null;
}

type FeaturesCatalogBrochureProps = {
  onDetailOpen?: (open: boolean) => void;
  onLogin?: () => void;
};

export function FeaturesCatalogBrochure({ onDetailOpen, onLogin }: FeaturesCatalogBrochureProps) {
  const [openId, setOpenId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readHashId() : null,
  );

  const syncFromUrl = useCallback(() => {
    setOpenId(readHashId());
  }, []);

  const select = useCallback((id: string) => {
    setOpenId(id);
    const path = `${window.location.pathname}#${id}`;
    window.history.replaceState(null, '', path);
    window.requestAnimationFrame(() => {
      document.getElementById('katalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const clearSelection = useCallback(() => {
    setOpenId(null);
    window.history.replaceState(null, '', window.location.pathname);
    window.requestAnimationFrame(() => {
      document.getElementById('katalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener(NAV_SYNC_EVENT, syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      window.removeEventListener('hashchange', syncFromUrl);
      window.removeEventListener(NAV_SYNC_EVENT, syncFromUrl);
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, [syncFromUrl]);

  useEffect(() => {
    onDetailOpen?.(!!openId);
  }, [openId, onDetailOpen]);

  const openModule = openId ? FEATURE_CATALOG.find((c) => c.id === openId) : null;

  if (openModule) {
    return (
      <FeatureModuleFullPage
        module={openModule}
        onBack={clearSelection}
        onSelectModule={select}
        onLogin={onLogin}
      />
    );
  }

  return (
    <section id="katalog" className="landing-catalog-brochure bg-slate-50 border-t border-slate-200 print:hidden">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-4">
        <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">Modül seçin</h2>
        <p className="text-slate-600 text-base max-w-2xl">
          Her karta tıklayın — ŞefPOS&apos;un o alandaki ekranları, tanıtımı ve tüm işlevleri tam sayfa açılır.
        </p>
      </div>
      <div className="max-w-6xl mx-auto px-4 pb-14">
        <FeatureModuleGrid onSelect={select} />
      </div>

      <div className="hidden print:block max-w-6xl mx-auto px-4 pb-12 space-y-10">
        {FEATURE_CATALOG.map((cat, idx) => (
          <article key={cat.id} className="print:break-inside-avoid-page">
            <h3 className="text-lg font-black">
              {String(idx + 1).padStart(2, '0')}. {cat.title}
            </h3>
            <p className="text-sm mt-2">{cat.pitch}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
