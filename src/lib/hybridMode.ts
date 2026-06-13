const eApi = () => (window as any).electronAPI;

export interface HybridLinkInfo {
  cloudTenantId: string;
  cloudBranchId: string;
  sqlTenantId: string;
  sqlBranchId: string;
  tenantName?: string;
  kasaLoginEmail?: string | null;
  linkedAt?: string;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
}

export function isHybridMode(): boolean {
  if (!(eApi()?.isElectron)) return false;
  try {
    return localStorage.getItem('dbMode') === 'hybrid';
  } catch {
    return false;
  }
}

export function isHybridCloudLinked(): boolean {
  try {
    return localStorage.getItem('shefpos_hybrid_linked') === 'true';
  } catch {
    return false;
  }
}

export function markHybridCloudLinked(linked: boolean): void {
  try {
    if (linked) localStorage.setItem('shefpos_hybrid_linked', 'true');
    else localStorage.removeItem('shefpos_hybrid_linked');
  } catch {
    /* ignore */
  }
}

export async function fetchHybridLinkInfo(): Promise<HybridLinkInfo | null> {
  const api = eApi();
  if (!api?.getHybridLink) return null;
  const res = await api.getHybridLink();
  if (!res?.success || !res.link) return null;
  return res.link as HybridLinkInfo;
}
