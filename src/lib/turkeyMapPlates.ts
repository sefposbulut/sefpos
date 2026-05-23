import { TURKEY_PROVINCES } from '../components/landing/content/turkeyLocations.generated';

/** Plaka kodu → il slug (harita data-plakakodu) */
export const PLATE_TO_SLUG = new Map<number, string>(
  TURKEY_PROVINCES.map((p) => [p.p, p.s]),
);

export function slugFromPlate(plate: number): string | null {
  return PLATE_TO_SLUG.get(plate) ?? null;
}
