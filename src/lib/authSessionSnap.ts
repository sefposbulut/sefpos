import type { Branch, UserPermissions } from '../contexts/AuthContext';
import type { Database } from './supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Tenant = Database['public']['Tables']['tenants']['Row'];

const AUTH_SNAP_KEY = 'sefpos.auth.sessionSnap';

export type AuthSessionSnap = {
  userId: string;
  profile: Profile;
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string | null;
  impersonationTenantId: string | null;
  permissions: UserPermissions;
};

export function persistAuthSessionSnap(snap: AuthSessionSnap): void {
  try {
    sessionStorage.setItem(AUTH_SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* quota / private mode */
  }
}

export function readAuthSessionSnap(userId: string): AuthSessionSnap | null {
  try {
    const raw = sessionStorage.getItem(AUTH_SNAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSessionSnap;
    if (!parsed || parsed.userId !== userId) return null;
    if (!parsed.profile?.id || !parsed.tenant?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthSessionSnap(): void {
  try {
    sessionStorage.removeItem(AUTH_SNAP_KEY);
  } catch {
    /* ignore */
  }
}
