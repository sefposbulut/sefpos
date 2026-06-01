/**
 * ŞefPOS Electron Content-Security-Policy.
 * Üretim: unsafe-eval yok → paketlenmiş EXE'de Electron güvenlik uyarısı çıkmaz.
 * Geliştirme: Vite HMR için unsafe-eval gerekir; uyarıyı kapatmak için
 * scripts/electron-dev-wait.mjs yalnızca dev sürecinde ELECTRON_DISABLE_SECURITY_WARNINGS kullanır.
 */

const PRIMARY_SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL || 'https://xdfnozfuuzctubijbnds.supabase.co'
).replace(/\/$/, '');
const PRIMARY_SUPABASE_WS = PRIMARY_SUPABASE_URL.replace(/^https:/, 'wss:');

/** @param {boolean} isDev */
/** @param {number} devPort */
function buildContentSecurityPolicy(isDev, devPort) {
  if (isDev) {
    const localHttp = `http://127.0.0.1:${devPort}`;
    const localHttpAlt = `http://localhost:${devPort}`;
    const localWs = `ws://127.0.0.1:${devPort}`;
    const localWsAlt = `ws://localhost:${devPort}`;
    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${localHttp} ${localHttpAlt}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: file: https:",
      `connect-src 'self' ${PRIMARY_SUPABASE_URL} ${PRIMARY_SUPABASE_WS} ${localHttp} ${localHttpAlt} ${localWs} ${localWsAlt} https: wss:`,
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: file: https:",
    `connect-src 'self' ${PRIMARY_SUPABASE_URL} ${PRIMARY_SUPABASE_WS} https: wss:`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * @param {import('electron').Session} session
 * @param {{ isDev: boolean; devPort: number; appDistDir: string }} opts
 */
function installElectronContentSecurityPolicy(session, opts) {
  const { isDev, devPort, appDistDir } = opts;
  const policy = buildContentSecurityPolicy(isDev, devPort);
  const distMarker = appDistDir.replace(/\\/g, '/').toLowerCase();

  session.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*', 'file://*/*'] }, (details, callback) => {
    const url = (details.url || '').toLowerCase();

    if (url.includes('shefpos_print_') || url.includes('shefpos_print')) {
      return callback({ responseHeaders: details.responseHeaders });
    }

    if (isDev) {
      const ok =
        url.startsWith(`http://127.0.0.1:${devPort}`) || url.startsWith(`http://localhost:${devPort}`);
      if (!ok) return callback({ responseHeaders: details.responseHeaders });
    } else if (url.startsWith('file://')) {
      if (!url.includes(distMarker)) {
        return callback({ responseHeaders: details.responseHeaders });
      }
    } else {
      return callback({ responseHeaders: details.responseHeaders });
    }

    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [policy];
    callback({ responseHeaders: headers });
  });
}

/** Vite build çıktısı index.html için meta etiketi */
function buildContentSecurityPolicyMetaContent() {
  return buildContentSecurityPolicy(false, 0);
}

module.exports = {
  buildContentSecurityPolicy,
  buildContentSecurityPolicyMetaContent,
  installElectronContentSecurityPolicy,
};
