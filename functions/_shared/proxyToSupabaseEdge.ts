/**
 * Cloudflare Pages → Supabase Edge Function proxy (Getir webhook vb.)
 */
const DEFAULT_UPSTREAM = 'https://xdfnozfuuzctubijbnds.supabase.co';

const HOP_BY_HOP = new Set([
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

export async function proxyToSupabaseEdge(
  request: Request,
  edgeFunctionName: string,
  env?: { SEFPOS_SUPABASE_URL?: string },
  /** Function adından sonra yol, örn. `/v1/orders` */
  subPath = '',
): Promise<Response> {
  const upstream = String(env?.SEFPOS_SUPABASE_URL || DEFAULT_UPSTREAM).replace(/\/$/, '');
  const url = new URL(request.url);
  const pathSuffix = subPath
    ? (subPath.startsWith('/') ? subPath : `/${subPath}`)
    : '';
  const dest = `${upstream}/functions/v1/${edgeFunctionName}${pathSuffix}${url.search}`;

  const out = new Headers();
  for (const [k, v] of request.headers) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || lk.startsWith('cf-')) continue;
    if (!v) continue;
    out.set(k, v);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let body: ArrayBuffer | undefined;
  if (hasBody) {
    body = await request.arrayBuffer();
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
