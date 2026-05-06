/**
 * Arka plan mutasyonları için sınırlı yeniden deneme (POS gecikmesini artırmadan).
 */
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<T> {
  const retries = options?.retries ?? 3;
  const base = options?.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, base * (attempt + 1)));
    }
  }
  throw lastErr;
}
