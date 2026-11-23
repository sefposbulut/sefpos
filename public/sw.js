const CACHE_NAME = 'sefpos-web-13';
const STATIC_ASSETS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  if (self.location.protocol === 'file:') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isDirectStaticFile(url) {
  const path = url.pathname;
  if (path === '/gizlilik-sefpos-garson.html') return true;
  if (/^\/download\/.+\.apk$/i.test(path)) return true;
  return false;
}

function isNavigationRequest(request, url) {
  if (isDirectStaticFile(url)) return false;
  if (request.mode === 'navigate') return true;
  const path = url.pathname;
  if (path === '/' || path.endsWith('/')) return true;
  if (path.endsWith('.html')) return true;
  if (path.endsWith('sw.js')) return true;
  return false;
}

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vds-api')) return;
  // Gizlilik HTML ve APK tarayıcıya gerçek dosya olarak gitsin (SPA önbelleği yok).
  if (isDirectStaticFile(url)) return;

  // HTML: ağ önce — soft refresh eski arayüzü bırakmasın
  if (isNavigationRequest(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          putInCache(event.request, response);
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          putInCache(event.request, response);
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        putInCache(event.request, response);
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
