import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { LandingLayout } from './LandingLayout';
import {
  parseLandingPath,
  landingPathToUrl,
  landingPathTitle,
  type ParsedLandingPath,
} from './landingRoutes';
import { SITE } from './content/siteContent';
import {
  HomePage,
  FeaturesPage,
  IntegrationsPage,
  PricingPage,
  DownloadPage,
  ResellerPage,
  ContactPage,
} from './pages/LandingPages';
import { getDistrictBySlugs, getProvinceBySlug } from './content/turkeyLocations.generated';
import {
  districtPageTitle,
  provincePageTitle,
} from './content/seoContent';

const RegionSeoPages = lazy(() =>
  import('./pages/RegionSeoPages').then((m) => ({
    default: m.RegionIndexPage,
  })),
);
const ProvinceSeoPageLazy = lazy(() =>
  import('./pages/RegionSeoPages').then((m) => ({ default: m.ProvinceSeoPage })),
);
const DistrictSeoPageLazy = lazy(() =>
  import('./pages/RegionSeoPages').then((m) => ({ default: m.DistrictSeoPage })),
);

interface LandingSiteProps {
  onLogin: () => void;
}

function readPath(): ParsedLandingPath {
  return typeof window !== 'undefined'
    ? parseLandingPath(window.location.pathname)
    : { kind: 'static', route: '/' };
}

export function LandingSite({ onLogin }: LandingSiteProps) {
  const [parsed, setParsed] = useState<ParsedLandingPath>(readPath);

  const navigate = useCallback((path: string) => {
    const next = parseLandingPath(path);
    const url = landingPathToUrl(next);
    if (typeof window !== 'undefined' && window.location.pathname !== url) {
      window.history.pushState({}, '', url);
    }
    setParsed(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => setParsed(parseLandingPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let title: string;
    if (parsed.kind === 'static' && parsed.route === '/') {
      title = `${SITE.name} — Restoran POS & Online Sipariş`;
    } else if (parsed.kind === 'static') {
      title = `${landingPathTitle(parsed)} | ${SITE.name}`;
    } else if (parsed.kind === 'region-index') {
      title = `Türkiye Geneli Adisyon Yazılımı | ${SITE.name}`;
    } else if (parsed.kind === 'province') {
      const prov = getProvinceBySlug(parsed.provinceSlug);
      title = prov ? `${provincePageTitle(prov.n)} | ${SITE.name}` : `Bölge | ${SITE.name}`;
    } else {
      const match = getDistrictBySlugs(parsed.provinceSlug, parsed.districtSlug);
      title = match
        ? `${districtPageTitle(match.district.n, match.province.n)} | ${SITE.name}`
        : `Bölge | ${SITE.name}`;
    }
    document.title = title;
  }, [parsed]);

  const pageProps = { onLogin, onNavigate: navigate };

  let page;
  switch (parsed.kind) {
    case 'region-index':
      page = (
        <Suspense fallback={<LandingPageFallback />}>
          <RegionSeoPages {...pageProps} />
        </Suspense>
      );
      break;
    case 'province':
      page = (
        <Suspense fallback={<LandingPageFallback />}>
          <ProvinceSeoPageLazy {...pageProps} provinceSlug={parsed.provinceSlug} />
        </Suspense>
      );
      break;
    case 'district':
      page = (
        <Suspense fallback={<LandingPageFallback />}>
          <DistrictSeoPageLazy
            {...pageProps}
            provinceSlug={parsed.provinceSlug}
            districtSlug={parsed.districtSlug}
          />
        </Suspense>
      );
      break;
    case 'static':
    default:
      switch (parsed.route) {
        case '/ozellikler':
          page = <FeaturesPage {...pageProps} />;
          break;
        case '/entegrasyonlar':
          page = <IntegrationsPage {...pageProps} />;
          break;
        case '/fiyatlar':
          page = <PricingPage {...pageProps} />;
          break;
        case '/indir':
          page = <DownloadPage {...pageProps} />;
          break;
        case '/bayi':
          page = <ResellerPage {...pageProps} />;
          break;
        case '/iletisim':
          page = <ContactPage {...pageProps} />;
          break;
        default:
          page = <HomePage {...pageProps} />;
      }
  }

  return (
    <LandingLayout parsed={parsed} onNavigate={navigate} onLogin={onLogin}>
      {page}
    </LandingLayout>
  );
}

function LandingPageFallback() {
  return (
    <div className="py-24 flex justify-center">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
