import type { DashboardSnapshot, RecentActivityRow, TopSellerRow } from './electronDashboardData';

export type ElectronHomeCachePayload = {
  stats: DashboardSnapshot;
  recent: RecentActivityRow[];
  topSellers: TopSellerRow[];
  cachedAt: number;
};

const PREFIX = 'sefpos:electron-home:v1:';
const ram = new Map<string, ElectronHomeCachePayload>();

export function electronHomeCacheKey(tenantId: string, branchId: string): string {
  return `${tenantId}:${branchId}`;
}

export function readElectronHomeCache(tenantId: string, branchId: string): ElectronHomeCachePayload | null {
  const key = electronHomeCacheKey(tenantId, branchId);
  const hit = ram.get(key);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ElectronHomeCachePayload;
    if (!parsed?.stats) return null;
    ram.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeElectronHomeCache(
  tenantId: string,
  branchId: string,
  payload: Omit<ElectronHomeCachePayload, 'cachedAt'>,
): void {
  const key = electronHomeCacheKey(tenantId, branchId);
  const full: ElectronHomeCachePayload = { ...payload, cachedAt: Date.now() };
  ram.set(key, full);
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify(full));
  } catch {
    /* quota */
  }
}
