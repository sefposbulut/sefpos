import type { LandingRoute } from './content/siteContent';

const STATIC_ROUTES: LandingRoute[] = [
  '/',
  '/ozellikler',
  '/entegrasyonlar',
  '/fiyatlar',
  '/indir',
  '/bayi',
  '/iletisim',
];

export type ParsedLandingPath =
  | { kind: 'static'; route: LandingRoute }
  | { kind: 'region-index' }
  | { kind: 'province'; provinceSlug: string }
  | { kind: 'district'; provinceSlug: string; districtSlug: string };

function normalizePath(pathname: string): string {
  const raw = (pathname || '/').split('?')[0].split('#')[0];
  const p = raw.replace(/\/+$/, '') || '/';
  return decodeURIComponent(p);
}

export function parseLandingPath(pathname: string): ParsedLandingPath {
  const p = normalizePath(pathname);

  if (STATIC_ROUTES.includes(p as LandingRoute)) {
    return { kind: 'static', route: p as LandingRoute };
  }

  if (p === '/bolge') {
    return { kind: 'region-index' };
  }

  const parts = p.split('/').filter(Boolean);
  if (parts[0] === 'bolge' && parts.length === 2) {
    return { kind: 'province', provinceSlug: parts[1].toLowerCase() };
  }
  if (parts[0] === 'bolge' && parts.length === 3) {
    return {
      kind: 'district',
      provinceSlug: parts[1].toLowerCase(),
      districtSlug: parts[2].toLowerCase(),
    };
  }

  return { kind: 'static', route: '/' };
}

export function normalizeLandingPath(pathname: string): LandingRoute {
  const parsed = parseLandingPath(pathname);
  if (parsed.kind === 'static') return parsed.route;
  return '/';
}

export function isLandingPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (STATIC_ROUTES.includes(p as LandingRoute) || p === '/') return true;
  if (p === '/bolge' || p.startsWith('/bolge/')) return true;
  return false;
}

export function landingPathToUrl(parsed: ParsedLandingPath): string {
  switch (parsed.kind) {
    case 'static':
      return parsed.route;
    case 'region-index':
      return '/bolge';
    case 'province':
      return `/bolge/${parsed.provinceSlug}`;
    case 'district':
      return `/bolge/${parsed.provinceSlug}/${parsed.districtSlug}`;
    default:
      return '/';
  }
}

export function landingPathTitle(parsed: ParsedLandingPath): string {
  if (parsed.kind === 'static') {
    const map: Record<LandingRoute, string> = {
      '/': 'Ana Sayfa',
      '/ozellikler': 'ŞefPOS Özellikleri',
      '/entegrasyonlar': 'Entegrasyonlar',
      '/fiyatlar': 'Fiyatlar',
      '/indir': 'İndir',
      '/bayi': 'Bayi Programı',
      '/iletisim': 'İletişim',
    };
    return map[parsed.route];
  }
  if (parsed.kind === 'region-index') return 'Bölgeler';
  if (parsed.kind === 'province') return `Bölge — ${parsed.provinceSlug}`;
  return `Bölge — ${parsed.districtSlug}`;
}
