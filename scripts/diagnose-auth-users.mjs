/**
 * auth.users + tetikleyici teşhisi (NODE_TLS... ile çalışır).
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

function extractRefFromSupabaseUrl(url) {
  try {
    const m = new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  extractRefFromSupabaseUrl(process.env.VITE_SUPABASE_URL || '') ||
  'xdfnozfuuzctubijbnds';
const password = process.env.SUPABASE_DB_PASSWORD;
const connectionString = process.env.DATABASE_URL;

async function connect() {
  if (connectionString) return new pg.Client({ connectionString });
  if (!password) throw new Error('SUPABASE_DB_PASSWORD veya DATABASE_URL gerekli');
  const host = `db.${ref}.supabase.co`;
  const enc = encodeURIComponent(password);
  const connStr = `postgresql://postgres:${enc}@${host}:5432/postgres?sslmode=no-verify`;
  let v4 = [];
  try {
    v4 = await dns.resolve4(host);
  } catch {
    /* */
  }
  if (v4.length) return new pg.Client({ connectionString: connStr });
  const v6 = await dns.resolve6(host).catch(() => []);
  if (v6.length) {
    return new pg.Client({
      host: v6[0],
      port: 5432,
      user: 'postgres',
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: true, servername: host },
    });
  }
  return new pg.Client({ connectionString: connStr });
}

const client = await connect();
await client.connect();
console.log('Ref:', ref);

const triggers = await client.query(`
  SELECT tgname, pg_get_triggerdef(t.oid)
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
  ORDER BY tgname
`);
console.log('\n--- auth.users triggers ---');
for (const row of triggers.rows) console.log(row.tgname, '\n', row.pg_get_triggerdef);

const nulls = await client.query(`
  SELECT column_name, data_type, udt_name,
    (SELECT count(*) FROM auth.users u WHERE (to_jsonb(u) -> column_name) = 'null'::jsonb) AS null_rows
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'users'
    AND is_nullable = 'YES'
    AND data_type IN ('text', 'character varying', 'character', 'USER-DEFINED')
  ORDER BY null_rows DESC, column_name
`);
console.log('\n--- nullable text-like columns + null count ---');
for (const row of nulls.rows) {
  if (Number(row.null_rows) > 0) console.log(row.column_name, row.data_type, row.udt_name, 'nulls=', row.null_rows);
}

const sample = await client.query(`
  SELECT id, email, aud, role,
    length(coalesce(confirmation_token,'')) as ct_len,
    instance_id IS NULL as inst_null
  FROM auth.users LIMIT 20
`);
console.log('\n--- sample rows (first 20) ---');
console.table(sample.rows);

const ident = await client.query(`
  SELECT i.* FROM auth.identities i ORDER BY i.created_at NULLS LAST LIMIT 10
`);
console.log('\n--- auth.identities (first 10) ---');
console.log(JSON.stringify(ident.rows, null, 2));

const pid = await client.query(`
  SELECT count(*) AS n FROM auth.identities WHERE provider_id IS NULL OR btrim(provider_id::text) = ''
`);
console.log('\nidentities with empty provider_id:', pid.rows[0]);

await client.end();
