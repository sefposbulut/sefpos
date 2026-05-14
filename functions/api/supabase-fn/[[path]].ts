/**
 * Cloudflare Pages Function: GET/POST …/api/supabase-fn/<edge-name>?…
 * → Supabase https://<ref>.supabase.co/functions/v1/<edge-name>?…
 *
 * Ortam değişkeni (CF Pages → Settings → Environment variables):
 *   SEFPOS_SUPABASE_URL = https://xdfnozfuuzctubijbnds.supabase.co
 * Tanımlı değilse aşağıdaki birincil proje URL'si kullanılır.
 */
type CfParams = Record<string, string | string[] | undefined>;

function joinPathParam(path: string | string[] | undefined): string {
  if (path == null) return '';
  return Array.isArray(path) ? path.join('/') : String(path);
}

export async function onRequest(context: { request: Request; env: { SEFPOS_SUPABASE_URL?: string }; params: CfParams }): Promise<Response> {
  const DEFAULT_UPSTREAM = 'https://xdfnozfuuzctubijbnds.supabase.co';
  const upstream = String(context.env?.SEFPOS_SUPABASE_URL || DEFAULT_UPSTREAM).replace(/\/$/, '');

  const sub = joinPathParam(context.params.path as string | string[] | undefined).replace(/^\/+/, '');
  if (!sub) {
    return new Response(
      JSON.stringify({
        error: 'Eksik yol',
        ornek: `${new URL(context.request.url).origin}/api/supabase-fn/getir-webhook?type=new`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  const url = new URL(context.request.url);
  const dest = `${upstream}/functions/v1/${sub}${url.search}`;

  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
  ]);

  const out = new Headers();
  for (const [k, v] of context.request.headers) {
    const lk = k.toLowerCase();
    if (hopByHop.has(lk) || lk.startsWith('cf-')) continue;
    if (!v) continue;
    out.set(k, v);
  }

  const method = context.request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let body: ArrayBuffer | undefined;
  if (hasBody) {
    body = await context.request.arrayBuffer();
  }

  try {
    return await fetch(dest, {
      method,
      headers: out,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: 'manual',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
