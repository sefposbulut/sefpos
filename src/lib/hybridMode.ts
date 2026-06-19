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

export interface HybridSyncResult {
  success?: boolean;
  error?: string;
  hadChanges?: boolean;
  pushedOrders?: number;
  pulledOrders?: number;
  pushedTables?: number;
  pulledCalls?: number;
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
let lastSyncStartedAt = 0;
let lastUiRefreshAt = 0;

/** Ardışık tam senkronlar arası minimum süre (kasa kasmasın). */
const MIN_SYNC_GAP_MS = 2_500;
/** Masa ızgarasını yenileme üst sınırı. */
const MIN_UI_REFRESH_GAP_MS = 2_000;
/** Olay birleştirme (sipariş/masa burst). */
const DEFAULT_SYNC_DEBOUNCE_MS = 900;

function hybridSyncHadChanges(res: HybridSyncResult | null | undefined): boolean {
  if (!res?.success) return false;
  if (res.hadChanges === true) return true;
  if (res.hadChanges === false) return false;
  return (
    (res.pushedOrders || 0) +
      (res.pulledOrders || 0) +
      (res.pushedTables || 0) +
      (res.pulledCalls || 0) >
    0
  );
}

/** Senkron tamamlandiginda yalnizca veri degisti ise masa izgarasini tazele. */
export function notifyHybridSyncSuccess(): void {
  const now = Date.now();
  if (now - lastUiRefreshAt < MIN_UI_REFRESH_GAP_MS) return;
  lastUiRefreshAt = now;
  clearAllTableGridSnapshots();
  window.dispatchEvent(new CustomEvent('sefpos:tables-changed'));
}

async function executeHybridSync(force = false): Promise<void> {
  if (!isHybridMode() || !isHybridCloudLinked()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    offlinePending = true;
    return;
  }
  const now = Date.now();
  if (!force && now - lastSyncStartedAt < MIN_SYNC_GAP_MS) {
    syncQueued = true;
    if (!syncTimer) {
      const wait = MIN_SYNC_GAP_MS - (now - lastSyncStartedAt);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void executeHybridSync(false);
      }, wait);
    }
    return;
  }
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  const api = eApi();
  if (!api?.hybridSyncNow) return;

  syncInFlight = true;
  lastSyncStartedAt = Date.now();
  try {
    const res = (await api.hybridSyncNow()) as HybridSyncResult | undefined;
    if (hybridSyncHadChanges(res)) notifyHybridSyncSuccess();
  } catch {
    /* ignore */
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      void executeHybridSync(false);
    }
  }
}

/**
 * Hibrit: siparis/masa degisince bulut↔SQL esitle (birlesik, kasmayi onler).
 */
export function requestHybridSync(delayMs = DEFAULT_SYNC_DEBOUNCE_MS): void {
  if (!isHybridMode() || !isHybridCloudLinked()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    offlinePending = true;
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void executeHybridSync(false);
  }, delayMs);
}

/** Internet geri gelince bekleyen degisiklikleri hemen esitle. */
export function flushHybridSyncOnReconnect(): void {
  if (!isHybridMode() || !isHybridCloudLinked()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (offlinePending) offlinePending = false;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  void executeHybridSync(true);
}
