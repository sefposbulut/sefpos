/** Lisans / super-admin paneli erişim kuralları (istemci + sunucu RLS ile birlikte). */

export const AYKA_AUTH_KEY = 'shefpos_ayka_auth';

/** Bu e-postalar dışındaki super_admin bayrakları panelde geçersiz sayılır. */
export const ADMIN_ALLOWED_EMAILS = ['info@aykasoft.com.tr'] as const;

export function normalizeAdminEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

export function isAdminAllowedEmail(email: string | null | undefined): boolean {
  const e = normalizeAdminEmail(email);
  return (ADMIN_ALLOWED_EMAILS as readonly string[]).includes(e);
}

export function hasAykaSessionFlag(): boolean {
  try {
    return localStorage.getItem(AYKA_AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAykaSessionFlag(): void {
  try {
    localStorage.setItem(AYKA_AUTH_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function clearAykaSessionFlag(): void {
  try {
    localStorage.removeItem(AYKA_AUTH_KEY);
  } catch {
    /* */
  }
}

export function canAccessAdminPanel(
  profile: { is_super_admin?: boolean | null; email?: string | null } | null | undefined,
  opts?: { requireAykaRoute?: boolean; isAykaRoute?: boolean },
): boolean {
  if (!profile?.is_super_admin) return false;
  if (!isAdminAllowedEmail(profile.email)) return false;
  if (opts?.requireAykaRoute || opts?.isAykaRoute) {
    if (!opts.isAykaRoute) return false;
    if (!hasAykaSessionFlag()) return false;
  }
  return true;
}
