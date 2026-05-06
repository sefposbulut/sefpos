import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

function readViteSupabaseUrlFromEnvFiles(mode: string): string {
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
        if (k !== 'VITE_SUPABASE_URL') continue;
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (v) return v.replace(/\/$/, '');
      }
    } catch {
      /* dosya yok */
    }
  }
  return '';
}

/** Yerel dev'de Vite config aşamasında URL (UTF-16 .env için yedek). */
function readSupabaseDevUrlFromPortJson(): string {
  try {
    const raw = readFileSync(join(__root, 'sefpos-dev-port.json'), 'utf8');
    const j = JSON.parse(raw) as { supabaseDevUrl?: string };
    const u = (j.supabaseDevUrl || '').trim().replace(/\/$/, '');
    if (u && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u)) return u;
  } catch {
    /* ignore */
  }
  return '';
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const viteSupabaseUrl = resolveDevSupabaseUrl(mode);
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

  return {
    plugins,
    base: './',
    server: {
      port: SEFPOS_DEV_PORT,
      strictPort: true,
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
