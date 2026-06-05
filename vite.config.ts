import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  buildContentSecurityPolicyMetaContent,
  buildWebContentSecurityPolicyHeader,
} from './electron/csp.cjs';

const __root = dirname(fileURLToPath(import.meta.url));

function readSefposDevPort(): number {
  try {
    const raw = readFileSync(join(__root, 'sefpos-dev-port.json'), 'utf8');
    const j = JSON.parse(raw) as { port?: number };
    const n = Number(j.port);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  } catch {
    /* ignore */
  }
  return 5180;
}

const SEFPOS_DEV_PORT = readSefposDevPort();

/** Cursor/Notepad bazen .env'i UTF-16 yazar; loadEnv satırları görmez. */
function readFileTextMaybeUtf16(filePath: string): string {
  const buf = readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const copy = Buffer.from(buf.subarray(2));
    for (let i = 0; i < copy.length - 1; i += 2) {
      const a = copy[i];
      copy[i] = copy[i + 1];
      copy[i + 1] = a;
    }
    return copy.toString('utf16le');
  }
  return buf.toString('utf8');
}

function readViteEnvValueFromEnvFiles(mode: string, keyName: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const names = [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env'];
  for (const name of names) {
    try {
      const text = readFileTextMaybeUtf16(join(__root, name));
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim().replace(/^\uFEFF/, '');
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i <= 0) continue;
        const k = t.slice(0, i).trim();
        if (k !== keyName) continue;
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (v) return keyName === 'VITE_SUPABASE_URL' ? v.replace(/\/$/, '') : v;
      }
    } catch {
      /* dosya yok */
    }
  }
  return '';
}

function readViteSupabaseUrlFromEnvFiles(mode: string): string {
  return readViteEnvValueFromEnvFiles(mode, 'VITE_SUPABASE_URL');
}

function readViteSupabaseAnonFromEnvFiles(mode: string): string {
  return readViteEnvValueFromEnvFiles(mode, 'VITE_SUPABASE_ANON_KEY');
}

/** Yerel dev'de Vite config aşamasında URL (UTF-16 .env için yedek). */
function readSefposDevPortJson(): { url: string; anon: string; devPortJsonOverridesEnv: boolean } {
  try {
    const raw = readFileSync(join(__root, 'sefpos-dev-port.json'), 'utf8');
    const j = JSON.parse(raw) as {
      supabaseDevUrl?: string;
      supabaseDevAnonKey?: string;
      /** true iken `vite` dev sunucusunda .env içindeki VITE_SUPABASE_* yerine bu dosyadaki URL/anon kullanılır (yanlış/bozuk ref’i geç). */
      devPortJsonOverridesEnv?: boolean | string;
    };
    const u = (j.supabaseDevUrl || '').trim().replace(/\/$/, '');
    const anon = (j.supabaseDevAnonKey || '').trim();
    const urlOk = u && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u);
    const ov = j.devPortJsonOverridesEnv;
    const devPortJsonOverridesEnv = ov === true || ov === 'true' || ov === 1 || ov === '1';
    return {
      url: urlOk ? u : '',
      anon,
      devPortJsonOverridesEnv,
    };
  } catch {
    /* ignore */
  }
  return { url: '', anon: '', devPortJsonOverridesEnv: false };
}

function readSupabaseDevUrlFromPortJson(): string {
  return readSefposDevPortJson().url;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const m = (req.method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Vite'nin server.proxy'si bazı ortamlarda /__supabase-functions için 404 bırakıyor.
 * Bu middleware isteği Node fetch ile iletir (OPTIONS dahil).
 */
function supabaseFunctionsDevProxy(supabaseOrigin: string): Plugin {
  const origin = supabaseOrigin.replace(/\/$/, '');
  return {
    name: 'sefpos-supabase-fn-proxy',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url || '';
        if (!raw.startsWith('/__supabase-functions')) {
          next();
          return;
        }
        try {
          const local = new URL(raw, 'http://127.0.0.1');
          const upstreamPath =
            local.pathname.replace(/^\/__supabase-functions/, '/functions/v1') + local.search;
          const dest = `${origin}${upstreamPath}`;

          const bodyBuf = await readRequestBody(req);

          const hopByHop = new Set([
            'connection',
            'keep-alive',
            'proxy-authenticate',
            'proxy-authorization',
            'te',
            'trailers',
            'transfer-encoding',
            'upgrade',
            /** Yerel Host upstream'e gitmez; yanlış Host 404 / gateway hatasına yol açar */
            'host',
            'content-length',
          ]);
          const fwdHeaders = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (!v || hopByHop.has(k.toLowerCase())) continue;
            if (Array.isArray(v)) {
              for (const part of v) fwdHeaders.append(k, part);
            } else {
              fwdHeaders.set(k, v);
            }
          }

          const r = await fetch(dest, {
            method: req.method || 'GET',
            headers: fwdHeaders,
            body: bodyBuf.length ? bodyBuf : undefined,
          });

          res.statusCode = r.status;
          r.headers.forEach((value, key) => {
            const lk = key.toLowerCase();
            if (lk === 'transfer-encoding' || lk === 'connection') return;
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          console.error('[ŞefPOS Edge proxy]', e);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Edge proxy hatası', detail: String((e as Error)?.message || e) }));
          }
        }
      });
    },
  };
}

function resolveDevSupabaseUrl(mode: string): string {
  const env = loadEnv(mode, __root, 'VITE_');
  const fromEnv =
    (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '') ||
    readViteSupabaseUrlFromEnvFiles(mode) ||
    (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const fromPortJson = readSupabaseDevUrlFromPortJson();
  return fromEnv || fromPortJson;
}

/** Birincil ŞefPOS bulut ref (AGENTS.md). Anon JWT projeye özel — repoda gömülü tutulmaz; .env veya sefpos-dev-port.json. */
const DEFAULT_PRIMARY_SUPABASE_URL = 'https://xdfnozfuuzctubijbnds.supabase.co';
const DEFAULT_PRIMARY_SUPABASE_ANON_KEY = '';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, __root, 'VITE_');
  const viteUrlFromEnv =
    (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '') ||
    readViteSupabaseUrlFromEnvFiles(mode) ||
    (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const viteAnonFromEnv =
    (env.VITE_SUPABASE_ANON_KEY || '').trim() ||
    readViteSupabaseAnonFromEnvFiles(mode) ||
    (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const { url: jsonUrl, anon: jsonAnon, devPortJsonOverridesEnv } = readSefposDevPortJson();
  const isDevServe = command === 'serve';

  const effectiveNoEnvUrl = jsonUrl || DEFAULT_PRIMARY_SUPABASE_URL;
  const anonForJsonUrl =
    jsonAnon ||
    (effectiveNoEnvUrl === DEFAULT_PRIMARY_SUPABASE_URL ? DEFAULT_PRIMARY_SUPABASE_ANON_KEY : '');

  const forceDevSupabaseFromPortJson =
    isDevServe && devPortJsonOverridesEnv && !!jsonUrl && !!anonForJsonUrl;

  if (isDevServe && devPortJsonOverridesEnv && jsonUrl && !anonForJsonUrl) {
    console.warn(
      '[ŞefPOS] devPortJsonOverridesEnv açık; supabaseDevAnonKey boş — override uygulanamıyor. `supabaseDevAnonKey` ekleyin veya `.env` içinde `VITE_SUPABASE_ANON_KEY` tanımlayın (Dashboard → API → anon).',
    );
  }

  const devFallbackSupabaseUrl = isDevServe && !viteUrlFromEnv && !forceDevSupabaseFromPortJson ? effectiveNoEnvUrl : '';
  const devFallbackSupabaseAnon =
    isDevServe && !viteAnonFromEnv && !forceDevSupabaseFromPortJson
      ? jsonAnon ||
        (effectiveNoEnvUrl === DEFAULT_PRIMARY_SUPABASE_URL ? DEFAULT_PRIMARY_SUPABASE_ANON_KEY : '')
      : '';

  const viteSupabaseUrl = forceDevSupabaseFromPortJson
    ? jsonUrl
    : resolveDevSupabaseUrl(mode) || (isDevServe ? DEFAULT_PRIMARY_SUPABASE_URL : '');

  const define: Record<string, string> = {
    __SEFPOS_DEV_SUPABASE_URL__: JSON.stringify(devFallbackSupabaseUrl),
    __SEFPOS_DEV_SUPABASE_ANON_KEY__: JSON.stringify(devFallbackSupabaseAnon),
    /** import.meta.env define’ı güvenilir değil; src/lib/supabase.ts doğrudan bunu okur. */
    __SEFPOS_DEV_PORT_OVERRIDE_URL__: JSON.stringify(forceDevSupabaseFromPortJson ? jsonUrl : ''),
    __SEFPOS_DEV_PORT_OVERRIDE_ANON__: JSON.stringify(forceDevSupabaseFromPortJson ? anonForJsonUrl : ''),
  };

  if (forceDevSupabaseFromPortJson) {
    console.info('[ŞefPOS] Yerel dev: devPortJsonOverridesEnv — .env / localStorage yerine →', jsonUrl);
  }

  const plugins: Plugin[] = [react()];
  if (viteSupabaseUrl) {
    try {
      new URL(viteSupabaseUrl);
      plugins.unshift(supabaseFunctionsDevProxy(viteSupabaseUrl));
    } catch {
      console.warn('[ŞefPOS] Geçersiz Supabase URL; Edge proxy kapalı:', viteSupabaseUrl);
    }
  } else {
    console.warn(
      '[ŞefPOS] VITE_SUPABASE_URL bulunamadı; yerel /__supabase-functions proxy devre dışı. .env veya sefpos-dev-port.json → supabaseDevUrl ekleyin.',
    );
  }

  // Cloudflare Pages: kök URL (/). Electron file:// yüklemesi CF_PAGES olmadan ./ kalır.
  const useRootAssetBase =
    process.env.CF_PAGES === '1' ||
    String(process.env.CF_PAGES || '').toLowerCase() === 'true' ||
    String(process.env.VITE_WEB_ROOT_BASE || '').trim() === '1';

  /** Web kökünde derleme: derin path'te yanlışlıkla SPA açılırsa ./manifest ve ./assets yine köke çözülsün. */
  if (useRootAssetBase) {
    plugins.push({
      name: 'sefpos-pages-html-base',
      enforce: 'post',
      transformIndexHtml(html: string) {
        return html.replace('<base href="./" />', '<base href="/" />');
      },
    });
  }

  if (command === 'build') {
    const cspMeta = buildContentSecurityPolicyMetaContent();
    plugins.push({
      name: 'sefpos-electron-csp-meta',
      transformIndexHtml(html: string) {
        const tag = `<meta http-equiv="Content-Security-Policy" content="${cspMeta.replace(/"/g, '&quot;')}" />`;
        if (html.includes('http-equiv="Content-Security-Policy"')) {
          return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*\/?>/, tag);
        }
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${tag}`);
      },
    });
    plugins.push({
      name: 'sefpos-web-csp-headers',
      closeBundle() {
        const policy = buildWebContentSecurityPolicyHeader();
        writeFileSync(
          join(__root, 'dist', '_headers'),
          `/*\n  Content-Security-Policy: ${policy}\n  X-Frame-Options: DENY\n`,
          'utf8',
        );
      },
    });
  }

  /** index.css HMR: yalnızca stil modülü + kısa debounce (Windows'ta art arda 10+ güncelleme kasması). */
  let cssHmrDebounce: ReturnType<typeof setTimeout> | null = null;
  plugins.push({
    name: 'sefpos-css-hmr-scope',
    apply: 'serve',
    handleHotUpdate(ctx) {
      const file = ctx.file.replace(/\\/g, '/');
      if (!file.endsWith('/src/index.css')) return;
      const scoped = ctx.modules.filter((m) => m.url?.includes('index.css'));
      return new Promise((resolve) => {
        if (cssHmrDebounce) clearTimeout(cssHmrDebounce);
        cssHmrDebounce = setTimeout(() => {
          cssHmrDebounce = null;
          resolve(scoped);
        }, 280);
      });
    },
  });

  /** Büyük POS bileşenlerinde HMR fırtınasını debounce et (OrderPanel / TableGrid kasması). */
  const HEAVY_HMR_SUFFIXES = [
    '/src/components/OrderPanel.tsx',
    '/src/components/TableGrid.tsx',
    '/src/App.tsx',
    '/src/components/TerminalMode.tsx',
  ];
  let heavyHmrDebounce: ReturnType<typeof setTimeout> | null = null;
  plugins.push({
    name: 'sefpos-heavy-tsx-hmr-debounce',
    apply: 'serve',
    handleHotUpdate(ctx) {
      const file = ctx.file.replace(/\\/g, '/');
      if (!HEAVY_HMR_SUFFIXES.some((s) => file.endsWith(s))) return;
      return new Promise((resolve) => {
        if (heavyHmrDebounce) clearTimeout(heavyHmrDebounce);
        heavyHmrDebounce = setTimeout(() => {
          heavyHmrDebounce = null;
          resolve(ctx.modules);
        }, 380);
      });
    },
  });

  return {
    define,
    plugins,
    base: useRootAssetBase ? '/' : './',
    server: {
      host: '127.0.0.1',
      port: SEFPOS_DEV_PORT,
      strictPort: true,
      hmr: {
        overlay: true,
      },
      watch: {
        // dist/build, release paketleri ve büyük ikili dosyalar watcher'ı tetikleyip
        // sonsuz HMR döngüsü + kasma yapabiliyor (özellikle Windows).
        ignored: [
          '**/dist/**',
          '**/release*/**',
          '**/release - Kopya/**',
          '**/.git/**',
          '**/node_modules/**',
          '**/.cursor/**',
          '**/terminals/**',
          '**/win-unpacked/**',
          '**/*.exe',
          '**/*.blockmap',
          '**/temp-*/**',
          '**/agent-transcripts/**',
          '**/*.cjs',
        ],
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            supabase: ['@supabase/supabase-js'],
            lucide: ['lucide-react'],
            'react-vendor': ['react', 'react-dom'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
