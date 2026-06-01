/** Electron ana sayfa — modül listesi anında görünsün (session + RAM). */

export type CachedHubTile = {
  id: string;
  label: string;
  description?: string;
  page: string;
};

export type CachedHubMenuGroup = {
  id: string;
  title: string;
  tiles: CachedHubTile[];
};

export type ElectronHubMenuCachePayload = {
  groups: CachedHubMenuGroup[];
  cachedAt: number;
};

const PREFIX = 'sefpos:electron-hub-menu:v1:';
const ram = new Map<string, ElectronHubMenuCachePayload>();

function key(tenantId: string): string {
  return tenantId;
}

export function readElectronHubMenuCache(tenantId: string): ElectronHubMenuCachePayload | null {
  const k = key(tenantId);
  const hit = ram.get(k);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${k}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ElectronHubMenuCachePayload;
    if (!Array.isArray(parsed?.groups)) return null;
    ram.set(k, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeElectronHubMenuCache(
  tenantId: string,
  groups: { id: string; title: string; tiles: { id: string; label: string; description?: string; page: string }[] }[],
): void {
  const payload: ElectronHubMenuCachePayload = {
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      tiles: g.tiles.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        page: t.page,
      })),
    })),
    cachedAt: Date.now(),
  };
  const k = key(tenantId);
  ram.set(k, payload);
  try {
    sessionStorage.setItem(`${PREFIX}${k}`, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
