import { supabase } from './supabase';
import { startAdaptivePoller } from './pollSchedule';

export const PROFILE_BASE_SELECT =
  'id, tenant_id, full_name, email, role, branch_id' as const;

/** Admin: bu süreden yeni ping = çevrimiçi */
export const ACTIVE_ONLINE_MS = 120_000;

function isMissingColumnError(err: { message?: string } | null, column: string): boolean {
  const m = String(err?.message || '').toLowerCase();
  const col = column.toLowerCase();
  return (
    m.includes(col) &&
    (m.includes('does not exist') ||
      m.includes('could not find') ||
      m.includes('schema cache') ||
      m.includes('42703'))
  );
}

export type TenantProfileRow = {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  role: string;
  branch_id: string | null;
  last_active_at?: string | null;
};

/** Migration öncesi DB'de last_active_at yoksa temel sütunlarla devam eder. */
export async function fetchTenantProfiles(tenantIds: string[]): Promise<{
  data: TenantProfileRow[];
  hasLastActiveColumn: boolean;
  error: { message?: string } | null;
}> {
  if (!tenantIds.length) {
    return { data: [], hasLastActiveColumn: false, error: null };
  }

  const withActive = await supabase
    .from('profiles')
    .select(`${PROFILE_BASE_SELECT}, last_active_at`)
    .in('tenant_id', tenantIds);

  if (!withActive.error) {
    return {
      data: (withActive.data || []) as TenantProfileRow[],
      hasLastActiveColumn: true,
      error: null,
    };
  }

  if (!isMissingColumnError(withActive.error, 'last_active_at')) {
    return { data: [], hasLastActiveColumn: false, error: withActive.error };
  }

  const base = await supabase
    .from('profiles')
    .select(PROFILE_BASE_SELECT)
    .in('tenant_id', tenantIds);

  return {
    data: (base.data || []) as TenantProfileRow[],
    hasLastActiveColumn: false,
    error: base.error,
  };
}

export async function fetchOnlineProfileIdsByTenant(
  tenantIds: string[],
): Promise<Record<string, string[]>> {
  if (!tenantIds.length) return {};

  const since = new Date(Date.now() - ACTIVE_ONLINE_MS).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, tenant_id')
    .in('tenant_id', tenantIds)
    .gte('last_active_at', since);

  if (error) {
    if (isMissingColumnError(error, 'last_active_at')) return {};
    return {};
  }

  const map: Record<string, string[]> = {};
  (data || []).forEach((p: { id: string; tenant_id: string }) => {
    if (!p.tenant_id) return;
    if (!map[p.tenant_id]) map[p.tenant_id] = [];
    map[p.tenant_id].push(p.id);
  });
  return map;
}

/** Açık uygulama: ~90 sn nabız (gizli sekme: yok). Admin çevrimiçi göstergesi için. */
const LAST_ACTIVE_PING_MS = 90_000;
const LAST_ACTIVE_PING_IDLE_MS = 180_000;

let stopPingPoller: (() => void) | null = null;
let kickoffTimer: ReturnType<typeof setTimeout> | null = null;
let pingUserId: string | null = null;
let lifecycleBound = false;

async function touchLastActive(userId: string): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const { error } = await supabase
    .from('profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', userId);
  if (error && import.meta.env.DEV) {
    console.warn('[ŞefPOS] last_active_at ping:', error.message);
  }
}

/** Çıkış / pencere kapanınca — admin panelinde hemen çevrimdışı */
async function clearLastActive(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ last_active_at: null })
    .eq('id', userId);
  if (error && import.meta.env.DEV) {
    console.warn('[ŞefPOS] last_active_at clear:', error.message);
  }
}

function onVisibilityChange(): void {
  if (!pingUserId) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    void touchLastActive(pingUserId);
  }
}

function onPageHide(): void {
  const uid = pingUserId;
  if (!uid) return;
  void clearLastActive(uid);
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof document === 'undefined') return;
  lifecycleBound = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
}

function unbindLifecycle(): void {
  if (!lifecycleBound || typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);
  lifecycleBound = false;
}

/** Oturum açık restoran kullanıcısı — admin paneli için hafif nabız. */
export function startTenantPresenceTracking(opts: {
  tenantId: string;
  userId: string;
  fullName?: string;
  role?: string;
}): void {
  const { userId } = opts;
  if (!userId) return;

  void stopTenantPresenceTracking();
  pingUserId = userId;
  bindLifecycle();

  void touchLastActive(userId);
  kickoffTimer = window.setTimeout(() => {
    kickoffTimer = null;
    if (pingUserId === userId) void touchLastActive(userId);
  }, 8_000);
  stopPingPoller = startAdaptivePoller({
    diagLabel: 'tenant-presence-ping',
    baseMs: LAST_ACTIVE_PING_MS,
    idleMs: LAST_ACTIVE_PING_IDLE_MS,
    hiddenMs: 0,
    run: () => touchLastActive(userId),
    immediate: false,
  });
}

/** Oturum bitti — ping durur; veritabanında çevrimdışı (çıkışta await edin). */
export async function stopTenantPresenceTracking(userIdToClear?: string | null): Promise<void> {
  const uid = userIdToClear ?? pingUserId;

  if (stopPingPoller) {
    stopPingPoller();
    stopPingPoller = null;
  }
  if (kickoffTimer) {
    clearTimeout(kickoffTimer);
    kickoffTimer = null;
  }

  pingUserId = null;
  unbindLifecycle();

  if (uid) await clearLastActive(uid);
}

export function isProfileOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() <= ACTIVE_ONLINE_MS;
}

export function onlineUserIdsFromProfiles(
  profiles: { id: string; last_active_at?: string | null }[] | undefined,
): string[] {
  if (!profiles?.length) return [];
  return profiles.filter((p) => isProfileOnline(p.last_active_at)).map((p) => p.id);
}

/** @deprecated Realtime presence kaldırıldı — admin DB ping okur */
export function subscribeTenantPresenceAdmin(
  _tenantId: string,
  onUpdate: (userIds: string[]) => void,
): () => void {
  onUpdate([]);
  return () => {};
}

export function formatOnlineLabel(count: number): string {
  if (count <= 0) return 'Çevrimdışı';
  if (count === 1) return '1 çevrimiçi';
  return `${count} çevrimiçi`;
}
