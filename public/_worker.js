/**
 * Cloudflare Pages Advanced mode — dist/_worker.js (build:pages ile kopyalanır).
 * /api/* → Supabase Edge; diğer istekler → statik SPA.
 * Ortam: SEFPOS_SUPABASE_URL (Cloudflare Pages → Production).
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

async function proxyToSupabaseEdge(request, edgeFunctionName, env) {
  const upstream = String(env?.SEFPOS_SUPABASE_URL || DEFAULT_UPSTREAM).replace(/\/$/, '');
  const url = new URL(request.url);
  const dest = `${upstream}/functions/v1/${edgeFunctionName}${url.search}`;

  const out = new Headers();
  for (const [k, v] of request.headers) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || lk.startsWith('cf-')) continue;
    if (!v) continue;
    out.set(k, v);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let body;
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

function getirWebhookGetResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'sefpos-getir-webhook-proxy',
      hint: 'Getir bu adrese POST yapar. Header: x-api-key. Tarayıcıda test için POST kullanın.',
      supabase_path: '/functions/v1/getir-webhook',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
}

const RELEASE_LATEST_YML =
  'https://github.com/sefposbulut/sefpos-releases/releases/latest/download/latest.yml';
const RELEASE_DOWNLOAD_BASE =
  'https://github.com/sefposbulut/sefpos-releases/releases/latest/download/';

async function resolveLatestSetupFilename() {
  const res = await fetch(RELEASE_LATEST_YML, {
    headers: { 'User-Agent': 'sefpos-setup-download/1' },
  });
  if (!res.ok) throw new Error(`latest.yml HTTP ${res.status}`);
  const yaml = await res.text();
  const match = yaml.match(/^path:\s*(\S+)\s*$/m);
  const name = match?.[1]?.trim();
  if (!name) throw new Error('latest.yml path missing');
  return name;
}

async function redirectLatestWindowsSetup() {
  try {
    const artifact = await resolveLatestSetupFilename();
    const dest = `${RELEASE_DOWNLOAD_BASE}${encodeURIComponent(artifact)}`;
    return Response.redirect(dest, 302);
  } catch {
    return new Response('Kurulum dosyası şu an indirilemiyor. Lütfen biraz sonra tekrar deneyin.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // sefpos.com.tr → www.sefpos.com.tr (apex custom domain aynı Pages projesine bağlı olmalı)
    if (url.hostname === 'sefpos.com.tr') {
      url.hostname = 'www.sefpos.com.tr';
      return Response.redirect(url.toString(), 301);
    }

    const path = url.pathname;

    if (path === '/download/setup' || path === '/download/Sefpos-Setup.exe') {
      if (request.method === 'GET' || request.method === 'HEAD') {
        return redirectLatestWindowsSetup();
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (path === '/api/getir-webhook' || path.startsWith('/api/getir-webhook/')) {
      if (request.method === 'GET' || request.method === 'HEAD') {
        return getirWebhookGetResponse();
      }
      return proxyToSupabaseEdge(request, 'getir-webhook', env);
    }

    const partnerApiPrefix = '/api/integrations/partner';
    const legacyPartnerPrefix = '/api/integrations/henemyolda';
    if (
      path === partnerApiPrefix ||
      path.startsWith(partnerApiPrefix + '/') ||
      path === legacyPartnerPrefix ||
      path.startsWith(legacyPartnerPrefix + '/')
    ) {
      const sub = path.startsWith(partnerApiPrefix)
        ? path.slice(partnerApiPrefix.length)
        : path.slice(legacyPartnerPrefix.length);
      const upstream = String(env?.SEFPOS_SUPABASE_URL || DEFAULT_UPSTREAM).replace(/\/$/, '');
      const dest = `${upstream}/functions/v1/partner-orders-api${sub || ''}${url.search}`;
      const out = new Headers();
      for (const [k, v] of request.headers) {
        const lk = k.toLowerCase();
        if (HOP_BY_HOP.has(lk) || lk.startsWith('cf-')) continue;
        if (!v) continue;
        out.set(k, v);
      }
      const method = request.method.toUpperCase();
      const hasBody = method !== 'GET' && method !== 'HEAD';
      let body;
      if (hasBody) body = await request.arrayBuffer();
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

    if (path.startsWith('/api/supabase-fn/')) {
      const sub = path.slice('/api/supabase-fn/'.length).replace(/^\/+/, '');
      if (!sub) {
        return new Response(
          JSON.stringify({
            error: 'Eksik yol',
            ornek: `${url.origin}/api/getir-webhook?type=new`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      return proxyToSupabaseEdge(request, sub, env);
    }

    return env.ASSETS.fetch(request);
  },
};
