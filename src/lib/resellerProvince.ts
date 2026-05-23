import { TURKEY_PROVINCES } from '../components/landing/content/turkeyLocations.generated';
import { normalizeCityName } from './turkeyCitiesDistricts';

const SLUG_BY_NORM = new Map<string, string>();
for (const p of TURKEY_PROVINCES) {
  SLUG_BY_NORM.set(normalizeCityName(p.n), p.s);
}

/** İl adı veya slug → province slug (turkeyLocations). */
export function resolveProvinceSlug(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const raw = input.trim();
  const asSlug = raw.toLowerCase().replace(/\s+/g, '-');
  if (TURKEY_PROVINCES.some((p) => p.s === asSlug)) return asSlug;
  const norm = normalizeCityName(raw);
  return SLUG_BY_NORM.get(norm) ?? null;
}

export function provinceDisplayName(slug: string | null | undefined): string {
  if (!slug) return '';
  return TURKEY_PROVINCES.find((p) => p.s === slug)?.n ?? slug;
}

export function groupProvincesByRegion() {
  const regions = new Map<string, typeof TURKEY_PROVINCES>();
  for (const p of TURKEY_PROVINCES) {
    const list = regions.get(p.b) ?? [];
    list.push(p);
    regions.set(p.b, list);
  }
  return Array.from(regions.entries()).map(([region, provinces]) => ({
    region,
    provinces: provinces.sort((a, b) => a.n.localeCompare(b.n, 'tr')),
  }));
}
