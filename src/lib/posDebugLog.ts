/** Geliştirme konsolu — varsayılan kapalı (localStorage `sefpos:verbose-log=1`). Üretimde no-op. */
export function posDebugLog(...args: unknown[]): void {
  if (!import.meta.env.DEV) return;
  try {
    if (localStorage.getItem('sefpos:verbose-log') !== '1') return;
  } catch {
    return;
  }
  console.info(...args);
}
