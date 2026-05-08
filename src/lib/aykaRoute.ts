/** Lisans (super-admin) paneli giriş URL yolu — tarayıcıda doğrudan yazılır. */
export const AYKA_ADMIN_PATH = '/ayka-yonetim45';

export function isAykaAdminPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  const base = AYKA_ADMIN_PATH.toLowerCase();
  return p === base || p.startsWith(`${base}/`);
}
