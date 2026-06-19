import type { User } from '@supabase/supabase-js';
import type { Branch, UserPermissions } from '../contexts/AuthContext';
import type { Database } from './supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Tenant = Database['public']['Tables']['tenants']['Row'];

const AUTH_SNAP_KEY = 'sefpos.auth.sessionSnap';
const ACTIVE_BRANCH_LS_KEY = 'shefpos_active_branch';

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

/** GoTrue oturum anahtarlarini temizle (gecersiz refresh token sonrasi). */
export function purgeSupabaseAuthLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.endsWith('-auth-token') || k.includes('supabase.auth'))) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  clearAuthSessionSnap();
}

function parseAuthStorageRefreshToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      refresh_token?: string;
      currentSession?: { refresh_token?: string };
    };
    const rt = parsed.refresh_token ?? parsed.currentSession?.refresh_token;
    return typeof rt === 'string' && rt.length > 0 ? rt : null;
  } catch {
    return null;
  }
}

/** localStorage'daki Supabase refresh token (yoksa null). */
export function readStoredSupabaseRefreshToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (!k.endsWith('-auth-token') && !k.includes('supabase.auth'))) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const rt = parseAuthStorageRefreshToken(raw);
      if (rt) return rt;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Uygulama acilisinda: auth kaydi var ama refresh token yoksa GoTrue 400 dongusune
 * girmeden once temizle.
 */
export function sanitizeSupabaseAuthStorageOnBoot(): boolean {
  if (typeof window === 'undefined') return false;
  if (!hasLikelyStoredAuthSession()) return false;
  if (readStoredSupabaseRefreshToken()) return false;
  purgeSupabaseAuthLocalStorage();
  return true;
}

export function isRefreshTokenNotFoundError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  const code = String((err as { code?: string })?.code ?? '').toLowerCase();
  return (
    code === 'refresh_token_not_found' ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('invalid_refresh_token')
  );
}

function resolveActiveBranch(snap: AuthSessionSnap): Branch | null {
  try {
    const lsId = localStorage.getItem(ACTIVE_BRANCH_LS_KEY);
    if (lsId) {
      const fromLs = snap.branches.find((b) => b.id === lsId);
      if (fromLs) return fromLs;
    }
  } catch {
    /* ignore */
  }
  if (snap.activeBranchId) {
    const saved = snap.branches.find((b) => b.id === snap.activeBranchId);
    if (saved) return saved;
  }
  return snap.branches.find((b) => b.is_main) || snap.branches[0] || null;
}

function parseStoredAuthJson(raw: string): {
  currentSession?: { user?: User };
  user?: User;
} | null {
  try {
    return JSON.parse(raw) as {
      currentSession?: { user?: User };
      user?: User;
    };
  } catch {
    return null;
  }
}

/** localStorage Supabase oturum anahtarından user id (senkron, getSession öncesi) */
export function readStoredSupabaseUserId(): string | null {
  const u = readStoredSupabaseUser();
  return u?.id ?? null;
}

/** getSession beklemeden User (Bağlanıyor splash'ini kaldırır) */
export function readStoredSupabaseUser(): User | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (!k.endsWith('-auth-token') && !k.includes('supabase.auth'))) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = parseStoredAuthJson(raw);
      const u = parsed?.currentSession?.user ?? parsed?.user;
      if (u?.id) return u;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** İlk paint: F5 / yeniden açılışta ağ beklemeden profil + tenant göster */
export function readBootstrapAuthSnap(): {
  snap: AuthSessionSnap;
  activeBranch: Branch | null;
} | null {
  try {
    const raw = sessionStorage.getItem(AUTH_SNAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSessionSnap;
    if (!parsed?.userId || !parsed.profile?.id || !parsed.tenant?.id) return null;
    const storedUid = readStoredSupabaseUserId();
    if (storedUid && storedUid !== parsed.userId) return null;
    return { snap: parsed, activeBranch: resolveActiveBranch(parsed) };
  } catch {
    return null;
  }
}

export type ResolvedBootAuth = {
  snap: AuthSessionSnap | null;
  activeBranch: Branch | null;
  user: User | null;
  /** true → tam ekran splash; false → doğrudan uygulama iskeleti */
  loading: boolean;
};

/** Tek seferde: snap + localStorage user + loading bayrağı */
export function resolveBootAuthState(): ResolvedBootAuth {
  const storedUser = readStoredSupabaseUser();
  const bootstrap = readBootstrapAuthSnap();

  if (bootstrap) {
    const uid = storedUser?.id ?? readStoredSupabaseUserId();
    if (uid && uid !== bootstrap.snap.userId) {
      return { snap: null, activeBranch: null, user: storedUser, loading: true };
    }
    return {
      snap: bootstrap.snap,
      activeBranch: bootstrap.activeBranch,
      user: storedUser,
      loading: false,
    };
  }

  if (storedUser) {
    return { snap: null, activeBranch: null, user: storedUser, loading: true };
  }

  return { snap: null, activeBranch: null, user: null, loading: true };
}

/** F5 sonrası kısa süre user=null iken pazarlama sayfası göstermemek için */
export function hasLikelyStoredAuthSession(): boolean {
  try {
    if (sessionStorage.getItem(AUTH_SNAP_KEY)) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.endsWith('-auth-token') || k.includes('supabase.auth'))) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
