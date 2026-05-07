/**
 * scripts/fix-gotrue-database-error-querying-schema.sql dosyasını doğrudan Postgres’e uygular.
 * Migration tablosundan bağımsızdır (GoTrue onarımını tekrarlamak güvenlidir).
 *
 * Gerekli: .env içinde SUPABASE_DB_PASSWORD veya DATABASE_URL (run-supabase-migrations-pg.mjs ile aynı).
 */
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
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
    process.env[k] = v;
  }
}

loadEnv();

const sqlPath = path.join(__dirname, 'fix-gotrue-database-error-querying-schema.sql');
if (!fs.existsSync(sqlPath)) {
  console.error('Dosya yok:', sqlPath);
  process.exit(1);
}
const sql = fs.readFileSync(sqlPath, 'utf8');

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
const ref = process.env.SUPABASE_PROJECT_REF || refFromViteUrl || 'xdfnozfuuzctubijbnds';
const password = process.env.SUPABASE_DB_PASSWORD;
let connectionString = process.env.DATABASE_URL;

if (connectionString) {
  const inferredRef = inferRefFromConnectionString(connectionString);
  if (inferredRef && inferredRef !== ref) {
    console.error(`DATABASE_URL ref uyusmuyor. Beklenen: ${ref}, okunan: ${inferredRef}`);
    process.exit(1);
  }
}

async function pgClientOptionsFromPassword(dbPassword) {
  const host = `db.${ref}.supabase.co`;
  const enc = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${enc}@${host}:5432/postgres?sslmode=no-verify`;
  let v4 = [];
  try {
    v4 = await dns.resolve4(host);
  } catch {
    /* empty */
  }
  if (v4.length) return { connectionString: connStr };
  try {
    const v6 = await dns.resolve6(host);
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
  } catch {
    /* empty */
  }
  return { connectionString: connStr };
}

let client;
if (connectionString) {
  client = new pg.Client({ connectionString });
} else {
  if (!password) {
    console.error('Eksik: SUPABASE_DB_PASSWORD veya DATABASE_URL (.env)');
    process.exit(1);
  }
  client = new pg.Client(await pgClientOptionsFromPassword(password));
}

try {
  await client.connect();
  console.log('Baglandi:', ref);
  await client.query(sql);
  console.log('OK: fix-gotrue-database-error-querying-schema.sql uygulandi.');
} catch (e) {
  console.error('HATA:', e.message || e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
