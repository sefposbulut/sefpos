/**
 * Partnerlere verilen Edge (webhook) URL'lerinin tabanı.
 * Cloudflare Pages'te `functions/api/supabase-fn` proxy kullanıyorsanız build ortamında:
 *   VITE_PUBLIC_SUPABASE_FN_PROXY_BASE_URL=https://www.sefpos.com.tr/api/supabase-fn
 * Boşsa doğrudan Supabase proje URL'si + /functions/v1 kullanılır.
 */
const PRIMARY_SUPABASE = 'https://xdfnozfuuzctubijbnds.supabase.co';

export function getPublicEdgeFunctionsBaseUrl(): string {
  const proxy = (import.meta.env.VITE_PUBLIC_SUPABASE_FN_PROXY_BASE_URL as string | undefined)?.trim().replace(/\/$/, '');
  if (proxy) return proxy;
  const base = (import.meta.env.VITE_SUPABASE_URL || PRIMARY_SUPABASE).replace(/\/$/, '');
  return `${base}/functions/v1`;
}

/** Örn: `getir-webhook?type=new` veya `yemeksepeti-webhook/abc123` */
export function publicPartnerEdgeUrl(pathAndQuery: string): string {
  const base = getPublicEdgeFunctionsBaseUrl();
  const p = pathAndQuery.startsWith('/') ? pathAndQuery.slice(1) : pathAndQuery;
  return `${base}/${p}`;
}
