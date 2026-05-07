/**
 * Geçersiz telefon ile send-sms-otp çağrısı — SMS gönderilmez, fonksiyonun yayında olduğunu doğrular.
 * Kullanım: node scripts/test-edge-sms-otp.mjs
 *
 * Anahtar: legacy JWT (eyJ...) veya yeni sb_publishable_... (Supabase API keys).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readEnvBytes(buf) {
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

function parseEnvFile(buf) {
  const text = readEnvBytes(buf);
  const o = {};
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim().replace(/^\uFEFF/, '');
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i <= 0) continue;
    let k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[k] = v;
  }
  return o;
}

function refFromSupabaseUrl(u) {
  try {
    const host = new URL(u.trim()).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[,;\s]+$/g, '');
}

function pickAnonKey(env) {
  const keys = [
    ['VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY],
    ['SUPABASE_ANON_KEY', env.SUPABASE_ANON_KEY],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ];
  for (const [name, v] of keys) {
    const k = normalizeKey(v);
    if (k) return { key: k, source: name };
  }
  return { key: '', source: null };
}

function isLegacyJwtAnon(key) {
  return key.startsWith('eyJ') && key.split('.').length === 3;
}

function isPublishableKey(key) {
  return key.startsWith('sb_publishable_');
}

/** Legacy anon JWT: payload içindeki ref (proje uyumu). */
function jwtPayloadRef(jwt) {
  const parts = String(jwt).trim().split('.');
  if (parts.length !== 3) return { ok: false, reason: 'JWT 3 parça değil' };
  let payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = payloadB64.length % 4;
  if (pad) payloadB64 += '='.repeat(4 - pad);
  try {
    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const p = JSON.parse(json);
    return { ok: true, ref: p.ref || null };
  } catch {
    return { ok: false, reason: 'JWT payload okunamadı' };
  }
}

function maskKey(k) {
  if (k.length <= 16) return '(çok kısa)';
  return `${k.slice(0, 12)}…(uzunluk ${k.length})`;
}

function exitCode(code) {
  setTimeout(() => process.exit(code), 200);
}

const envBuf = readFileSync(join(root, '.env'));
const env = parseEnvFile(envBuf);
const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const { key, source } = pickAnonKey(env);

if (!url || !key) {
  console.error('Eksik anahtar veya URL.');
  console.error(
    '  .env içinde şunlardan biri olmalı: VITE_SUPABASE_ANON_KEY (tercih), SUPABASE_ANON_KEY',
  );
  console.error('  ve VITE_SUPABASE_URL=https://<ref>.supabase.co');
  process.exit(1);
}

const urlRef = refFromSupabaseUrl(url);
if (!urlRef) {
  console.error('VITE_SUPABASE_URL geçersiz veya *.supabase.co değil:', url);
  process.exit(1);
}

console.log(`Anahtar kaynağı: ${source}  ${maskKey(key)}`);

if (isLegacyJwtAnon(key)) {
  const jwtInfo = jwtPayloadRef(key);
  if (!jwtInfo.ok) {
    console.error('JWT okunamadı:', jwtInfo.reason);
    console.error('Dashboard → Settings → API → "anon" "public" (legacy JWT, eyJ ile başlar).');
    process.exit(3);
  }
  if (jwtInfo.ref && jwtInfo.ref !== urlRef) {
    console.error('URL ile anon key farklı projeye ait:');
    console.error(`  URL ref: ${urlRef}  |  JWT ref: ${jwtInfo.ref}`);
    process.exit(3);
  }
} else if (isPublishableKey(key)) {
  console.log('(Yeni sb_publishable_ anahtarı — JWT ref kontrolü atlandı; URL ile aynı projeden kopyaladığınızdan emin olun.)');
} else {
  console.warn(
    'Uyarı: Anahtar ne klasik JWT (eyJ...) ne de sb_publishable_... görünüyor. Yine de istek atılıyor.',
  );
  console.warn('  Supabase Dashboard → Settings → API: "Publishable key" veya legacy "anon public" kullanın.');
}

const headers = {
  'Content-Type': 'application/json',
  apikey: key,
};
if (key.startsWith('eyJ') && key.split('.').length === 3) {
  headers.Authorization = `Bearer ${key}`;
}

const res = await fetch(`${url}/functions/v1/send-sms-otp`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ phone: '1', purpose: 'signup' }),
});
const txt = await res.text();
console.log('\nsend-sms-otp (geçersiz tel → SMS gitmez)');
console.log('HTTP', res.status);
console.log(txt);

if (res.status === 404) {
  console.error('\n→ Fonksiyon projede yok; deploy: npm run edge:deploy:sms -- --project-ref <ref>');
  exitCode(2);
} else if (res.status === 401) {
  console.error('\n→ 401: Anahtar bu proje için geçersiz veya hatalı yapıştırılmış.');
  console.error('   Tek satır, satır sonu yok; Dashboard API sayfasından yeniden kopyalayın.');
  exitCode(3);
} else if (!res.ok) {
  try {
    const j = JSON.parse(txt);
    if (j.error && String(j.error).includes('Geçerli')) {
      console.log('\n→ Edge çalışıyor (beklenen 400 doğrulama hatası).');
      exitCode(0);
    }
  } catch {
    /* ignore */
  }
  exitCode(1);
} else {
  console.error('\n→ Beklenmeyen 2xx yanıtı (geçersiz telefon için normalde 400).');
  exitCode(1);
}
