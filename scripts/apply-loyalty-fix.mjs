/**
 * loyalty_apply_for_order — customers.updated_at kaldırılmış sürümü uygular.
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
const version = '20260525120000_fix_loyalty_apply_customers_updated_at';
const file = '20260525120000_fix_loyalty_apply_customers_updated_at.sql';

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
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', file), 'utf8');

const { rows } = await client.query(
  'SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1',
  [version],
).catch(() => ({ rows: [] }));

if (!rows?.length) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text
    );
  `);
  await client.query(sql);
  await client.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [version, file],
  );
  console.log('Fix migration uygulandi');
} else {
  await client.query(sql.split('NOTIFY')[0]);
  try {
    await client.query(`NOTIFY pgrst, 'reload schema'`);
  } catch {
    /* ignore */
  }
  console.log('Fonksiyon yeniden yazildi (zaten kayitli migration)');
}

console.log('OK — loyalty_apply_for_order artik customers.updated_at kullanmiyor');
await client.end();
