/**
 * Yalnızca sadakat migration'ını uygular (20260524140000_loyalty_module).
 * .env: SUPABASE_DB_PASSWORD veya DATABASE_URL
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, i).trim()] = v;
  }
}

loadEnv();

const ref = process.env.SUPABASE_PROJECT_REF || 'xdfnozfuuzctubijbnds';
const password = process.env.SUPABASE_DB_PASSWORD;
const connectionString = process.env.DATABASE_URL;
const version = '20260524140000_loyalty_module';
const file = '20260524140000_loyalty_module.sql';

let client;
if (connectionString) {
  client = new pg.Client({ connectionString });
} else if (password) {
  client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=no-verify`,
  });
} else {
  console.error('SUPABASE_DB_PASSWORD veya DATABASE_URL gerekli');
  process.exit(1);
}

await client.connect();
console.log('Baglandi:', ref);

await client.query(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    name text
  );
`);

const { rows } = await client.query(
  'SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1',
  [version],
);
if (rows.length) {
  console.log('Sadakat migration zaten uygulanmis — schema cache yenileniyor…');
} else {

let sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', file), 'utf8');
// Block yorumlari kaldir (bazi araclar sorun cikarabilir)
sql = sql.replace(/\/\*\*[\s\S]*?\*\//g, '');

  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)',
      [version, file],
    );
    console.log('OK: loyalty_settings, loyalty_transactions, loyalty_apply_for_order');
  } catch (e) {
    console.error('HATA:', e.message || e);
    process.exit(1);
  }
}

const fn = await client.query(`
  SELECT pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'loyalty_apply_for_order'
`);
if (!fn.rows.length) {
  console.error('UYARI: loyalty_apply_for_order bulunamadi');
} else {
  console.log('RPC:', fn.rows[0].args);
}

try {
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log('PostgREST schema cache yenilendi (NOTIFY pgrst)');
} catch (e) {
  console.warn('NOTIFY pgrst atlandi:', e.message || e);
}

await client.end();
