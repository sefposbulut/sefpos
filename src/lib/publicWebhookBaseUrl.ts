/**
 * Partnerlere verilen Edge (webhook) URL'lerinin tabanı.
 * Cloudflare Pages'te `functions/api/supabase-fn` proxy kullanıyorsanız build ortamında:
 *   VITE_PUBLIC_SUPABASE_FN_PROXY_BASE_URL=https://www.sefpos.com.tr/api/supabase-fn
 * Boşsa doğrudan Supabase proje URL'si + /functions/v1 kullanılır.
 */
const PRIMARY_SUPABASE = 'https://xdfnozfuuzctubijbnds.supabase.co';

const WWW_WEBHOOK_PROXY_BASE = 'https://www.sefpos.com.tr/api/supabase-fn';

export function getPublicEdgeFunctionsBaseUrl(): string {
  const proxy = (import.meta.env.VITE_PUBLIC_SUPABASE_FN_PROXY_BASE_URL as string | undefined)?.trim().replace(/\/$/, '');
  if (proxy) return proxy;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'www.sefpos.com.tr' || host === 'sefpos.com.tr') {
      return `${window.location.origin}/api/supabase-fn`;
    }
  }

  const base = (import.meta.env.VITE_SUPABASE_URL || PRIMARY_SUPABASE).replace(/\/$/, '');
  return `${base}/functions/v1`;
}

/** Getir / Yemeksepeti panelinde gösterilecek kurumsal taban (build + www runtime). */
export function getPartnerWebhookBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SUPABASE_FN_PROXY_BASE_URL as string | undefined)?.trim().replace(/\/$/, '');
  return fromEnv || WWW_WEBHOOK_PROXY_BASE;
}

/** Örn: `getir-webhook?type=new` veya `yemeksepeti-webhook/abc123` */
export function publicPartnerEdgeUrl(pathAndQuery: string): string {
  const base = getPartnerWebhookBaseUrl();
  const p = pathAndQuery.startsWith('/') ? pathAndQuery.slice(1) : pathAndQuery;
  return `${base}/${p}`;
}
