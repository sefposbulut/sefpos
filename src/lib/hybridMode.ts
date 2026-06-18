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

const SQL_SETUP_KEY = 'shefpos_sql_setup_complete';

/** SQL / hibrit kurulum sihirbazı bir kez tamamlandı — uygulama açılışında tekrar sorma. */
export function markSqlSetupComplete(): void {
  try {
    localStorage.setItem(SQL_SETUP_KEY, 'true');
  } catch {
    /* ignore */
  }
}

export function isSqlSetupCompleteFlag(): boolean {
  try {
    return localStorage.getItem(SQL_SETUP_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markHybridSetupComplete(): void {
  markSqlSetupComplete();
  markHybridCloudLinked(true);
}

/** Electron: SQL yapılandırması veya hibrit bağlantı kayıtlı mı? */
export async function isElectronSqlReady(): Promise<boolean> {
  const api = eApi();
  if (!api?.isElectron) return false;
  if (isSqlSetupCompleteFlag() || isHybridCloudLinked()) return true;
  try {
    const cfg = await api.getSqlServerConfig?.();
    if (cfg?.host && cfg?.username) {
      markSqlSetupComplete();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function isElectronSqlReadySync(): boolean {
  if (!eApi()?.isElectron) return false;
  return isSqlSetupCompleteFlag() || isHybridCloudLinked();
}

/** Giriş ekranından tek tıkla bulut modu — SQL/hibrit yerine gerçek bulut oturumu. */
export async function switchElectronToCloudMode(): Promise<void> {
  await activateElectronCloudMode();
}

/** Bulut bağlantı modu: SQL/hibrit kalıntılarını temizle, gerçek Supabase oturumu. */
export async function activateElectronCloudMode(): Promise<void> {
  const api = eApi();
  try {
    await api?.setDbMode?.('cloud');
    localStorage.setItem('dbMode', 'cloud');
    localStorage.removeItem('shefpos_hybrid_linked');
    localStorage.removeItem('shefpos_sql_session');
    localStorage.removeItem('shefpos_sql_setup_complete');
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

function clearAllTableGridSnapshots(): void {
  try {
    void import('./tableGridData').then((m) => m.clearAllTableGridSnapshots());
  } catch {
    /* ignore */
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;
let syncQueued = false;
let offlinePending = false;

/** Senkron tamamlandiginda masa izgarasini tazele. */
export function notifyHybridSyncSuccess(): void {
  clearAllTableGridSnapshots();
  window.dispatchEvent(new CustomEvent('sefpos:tables-changed'));
}

async function executeHybridSync(): Promise<void> {
  if (!isHybridMode() || !isHybridCloudLinked()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    offlinePending = true;
    return;
  }
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  const api = eApi();
  if (!api?.hybridSyncNow) return;

  syncInFlight = true;
  try {
    const res = await api.hybridSyncNow();
    if (res?.success) notifyHybridSyncSuccess();
  } catch {
    /* ignore */
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      void executeHybridSync();
    }
  }
}

/**
 * Hibrit: siparis/masa degisince bulut↔SQL aninda esitle.
 * @param delayMs Birlestirme suresi (varsayilan ~1 kare, ~16ms).
 */
export function requestHybridSync(delayMs = 16): void {
  if (!isHybridMode() || !isHybridCloudLinked()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    offlinePending = true;
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void executeHybridSync();
  }, delayMs);
}

/** Internet geri gelince bekleyen degisiklikleri hemen esitle. */
export function flushHybridSyncOnReconnect(): void {
  if (!isHybridMode() || !isHybridCloudLinked()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (offlinePending) offlinePending = false;
  requestHybridSync(0);
}
