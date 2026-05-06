/**
 * Yeni Supabase Postgres'e repodaki tum supabase/migrations/*.sql dosyalarini
 * sira ile uygular (supabase_migrations.schema_migrations ile atlanir).
 *
 * Gerekli .env (proje kokunde):
 *   SUPABASE_DB_PASSWORD=<Dashboard Database sifresi>
 * veya
 *   DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslmode=require
 * Dogrudan baglanti IPv6-only ve aginiz IPv6 route etmiyorsa Dashboard → Database →
 * Connection string → "Session pooler" URI'yi DATABASE_URL olarak kullanin.
 *
 * Opsiyonel:
 *   SUPABASE_PROJECT_REF=orlydeyxshsdusxukhuu  (SEFPOS birincil ref; .env ile ezilebilir)
 */
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

function readEnvFileUtf8(envPath) {
  const buf = fs.readFileSync(envPath);
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

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = readEnvFileUtf8(envPath);
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    // Always honor repository .env values to avoid stale shell env variables
    // pointing migrations to the wrong Supabase project.
    process.env[k] = v;
  }
}

loadEnv();

function extractRefFromSupabaseUrl(url) {
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function inferRefFromConnectionString(conn) {
  try {
    const u = new URL(conn);
    const userMatch = (u.username || '').match(/^postgres\.([a-z0-9]+)$/i);
    if (userMatch) return userMatch[1];
    const hostMatch = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (hostMatch) return hostMatch[1];
    return null;
  } catch {
    return null;
  }
}

const refFromViteUrl = extractRefFromSupabaseUrl(process.env.VITE_SUPABASE_URL || '');
const ref = process.env.SUPABASE_PROJECT_REF || refFromViteUrl || 'orlydeyxshsdusxukhuu';
const password = process.env.SUPABASE_DB_PASSWORD;
let connectionString = process.env.DATABASE_URL;

if (connectionString) {
  const inferredRef = inferRefFromConnectionString(connectionString);
  if (inferredRef && inferredRef !== ref) {
    console.error(
      `DATABASE_URL proje ref uyusmuyor. Beklenen: ${ref}, URL'den okunan: ${inferredRef}`,
    );
    process.exit(1);
  }
}

/** Supabase `db.<ref>.supabase.co` bazen yalnizca AAAA doner; Node `lookup` ENOTFOUND verebilir. */
async function pgClientOptionsFromPassword(dbPassword) {
  const host = `db.${ref}.supabase.co`;
  const enc = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${enc}@${host}:5432/postgres?sslmode=require`;
  let v4 = [];
  let v6 = [];
  try {
    v4 = await dns.resolve4(host);
  } catch {
    /* yok */
  }
  if (v4.length) return { connectionString: connStr };
  try {
    v6 = await dns.resolve6(host);
  } catch {
    /* yok */
  }
  if (v6.length) {
    return {
      host: v6[0],
      port: 5432,
      user: 'postgres',
      password: dbPassword,
      database: 'postgres',
      ssl: { rejectUnauthorized: true, servername: host },
    };
  }
  return { connectionString: connStr };
}

let client;
if (connectionString) {
  client = new pg.Client({ connectionString });
} else {
  if (!password) {
    console.error(
      'Eksik: .env icinde SUPABASE_DB_PASSWORD veya DATABASE_URL tanimlayin.\n' +
        'Sifre: Supabase Dashboard → Project Settings → Database → Database password',
    );
    process.exit(1);
  }
  client = new pg.Client(await pgClientOptionsFromPassword(password));
}
try {
  await client.connect();
} catch (e) {
  const msg = String(e?.message || e);
  console.error('Postgres baglanamadi:', msg);
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
    console.error(
      'Ipucu: db.<ref>.supabase.co bazi projelerde yalnizca IPv6 doner; IPv4 aglarda\n' +
        'Supabase Dashboard → Database → Connection string → Session pooler URI\'yi\n' +
        '.env icinde DATABASE_URL olarak yapistirip tekrar deneyin.',
    );
  }
  if (msg.includes('password authentication failed')) {
    console.error(
      'Ipucu: Database password Dashboard → Settings → Database ile ayni olmali (kullanici: postgres).',
    );
  }
  process.exit(1);
}
console.log('Postgres baglandi:', ref);

await client.query(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    name text
  );
`);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let applied = 0;
for (const file of files) {
  const version = file.replace(/\.sql$/i, '');
  const { rows } = await client.query(
    'SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1',
    [version],
  );
  if (rows.length) continue;

  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  process.stdout.write(`Uygulaniyor: ${file} ... `);
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)',
      [version, file],
    );
    console.log('OK');
    applied++;
  } catch (e) {
    console.log('HATA');
    console.error(e.message || e);
    process.exit(1);
  }
}

await client.end();
console.log(`Bitti. Yeni uygulanan: ${applied}, zaten vardi: ${files.length - applied}`);
