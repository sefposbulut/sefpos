/**
 * Cloudflare Pages Advanced mode — dist/_worker.js (build:pages ile kopyalanır).
 * /api/* → Supabase Edge; diğer istekler → statik SPA.
 * Ortam: SEFPOS_SUPABASE_URL (Cloudflare Pages → Production).
 */
const DEFAULT_UPSTREAM = 'https://sefpos.com.tr';

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
  const configured = String(env?.SEFPOS_SUPABASE_URL || '').replace(/\/$/, '');
  const upstream = configured.includes('sefpos.com.tr') ? configured : DEFAULT_UPSTREAM;
  const url = new URL(request.url);
  const dest = `${upstream}/vds-api/fn/${edgeFunctionName}${url.search}`;

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

function apkDownloadName(pathname) {
  const raw = pathname.split('/').pop() || 'download.apk';
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, '');
  return safe || 'download.apk';
}

function isGarsonApkPath(pathname) {
  return /^\/download\/[^/]+\.apk$/i.test(pathname);
}

/** APK gerçek dosya kalsın. SPA index.html dönerse 404 ver. */
async function serveDownloadApk(request, env) {
  const url = new URL(request.url);
  const assetRes = await env.ASSETS.fetch(request);
  const ct = (assetRes.headers.get('content-type') || '').toLowerCase();
  if (!assetRes.ok || ct.includes('text/html')) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  const headers = new Headers(assetRes.headers);
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Disposition', `attachment; filename="${apkDownloadName(url.pathname)}"`);
  return new Response(assetRes.body, { status: assetRes.status, headers });
}

/**
 * /gizlilik-sefpos-garson.html gerçek politika dosyası.
 * Pages .html adresini uzantısız yola 307 yapabiliyor; gövdeyi 200 ile geri ver.
 */
async function serveGarsonPrivacy(request, env) {
  let assetRes = await env.ASSETS.fetch(request);
  if (assetRes.status >= 300 && assetRes.status < 400) {
    const loc = assetRes.headers.get('Location');
    if (loc) {
      const nextUrl = new URL(loc, request.url);
      assetRes = await env.ASSETS.fetch(
        new Request(nextUrl.toString(), { method: request.method, headers: request.headers }),
      );
    }
  }
  if (!assetRes.ok) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const headers = new Headers(assetRes.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.delete('Location');
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  const body = await assetRes.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(body);
  if (!text.includes('ŞEFPOS GARSON')) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(body, { status: 200, headers });
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

    if (path === '/gizlilik-sefpos-garson.html') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return serveGarsonPrivacy(request, env);
    }

    if (isGarsonApkPath(path)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return serveDownloadApk(request, env);
    }

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
      const configured = String(env?.SEFPOS_SUPABASE_URL || '').replace(/\/$/, '');
      const upstream = configured.includes('sefpos.com.tr') ? configured : DEFAULT_UPSTREAM;
      const dest = `${upstream}/vds-api/integrations/partner${sub || ''}${url.search}`;
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
