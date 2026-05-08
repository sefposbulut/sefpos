/**
 * turgutlu kullanıcısının auth.users + auth.identities + public.profiles
 * iz haritası. Login sorunlarını ve silme sonrası artıkları teşhis eder.
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

const ref = process.env.SUPABASE_PROJECT_REF || 'xdfnozfuuzctubijbnds';
const password = process.env.SUPABASE_DB_PASSWORD;
const dbUrl = process.env.DATABASE_URL;

async function connect() {
  if (dbUrl) {
    return new pg.Client({ connectionString: dbUrl });
  }
  if (!password) throw new Error('SUPABASE_DB_PASSWORD veya DATABASE_URL gerekli');
  const host = `db.${ref}.supabase.co`;
  const enc = encodeURIComponent(password);
  const connStr = `postgresql://postgres:${enc}@${host}:5432/postgres?sslmode=no-verify`;
  let v4 = [];
  try { v4 = await dns.resolve4(host); } catch { /* */ }
  if (v4.length) return new pg.Client({ connectionString: connStr });
  return new pg.Client({ connectionString: connStr });
}

const client = await connect();
await client.connect();
console.log('Ref:', ref);

console.log('\n--- public.profiles satırları (turgutlu*) ---');
const profiles = await client.query(`
  SELECT id, tenant_id, email, username, phone, role, full_name, is_active, created_at
  FROM public.profiles
  WHERE username ILIKE 'turgutlu%' OR email ILIKE '%turgutlu%' OR full_name ILIKE '%turgutlu%'
  ORDER BY created_at DESC
`);
console.table(profiles.rows);

console.log('\n--- auth.users satırları (turgutlu*) ---');
const users = await client.query(`
  SELECT id, email, raw_user_meta_data, last_sign_in_at, email_confirmed_at, created_at
  FROM auth.users
  WHERE email ILIKE '%turgutlu%' OR raw_user_meta_data::text ILIKE '%turgutlu%'
  ORDER BY created_at DESC
`);
console.table(users.rows.map((r) => ({
  id: r.id,
  email: r.email,
  meta: typeof r.raw_user_meta_data === 'object' ? JSON.stringify(r.raw_user_meta_data) : r.raw_user_meta_data,
  email_confirmed_at: r.email_confirmed_at,
  last_sign_in_at: r.last_sign_in_at,
  created_at: r.created_at,
})));

console.log('\n--- auth.identities (turgutlu*) ---');
const idents = await client.query(`
  SELECT i.user_id, i.provider, i.provider_id, i.email, i.identity_data
  FROM auth.identities i
  JOIN auth.users u ON u.id = i.user_id
  WHERE u.email ILIKE '%turgutlu%' OR u.raw_user_meta_data::text ILIKE '%turgutlu%'
`);
console.table(idents.rows);

console.log('\n--- profiles şeması ve indeksler ---');
const cols = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
  ORDER BY ordinal_position
`);
console.table(cols.rows);

const idx = await client.query(`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'profiles'
  ORDER BY indexname
`);
console.log('\n--- profiles indeksleri ---');
for (const r of idx.rows) console.log(' •', r.indexname, '\n   ', r.indexdef);

console.log('\n--- profiles RLS politikaları (anon için) ---');
const pol = await client.query(`
  SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS qual, pg_get_expr(polwithcheck, polrelid) AS withcheck,
         (SELECT array_agg(rolname) FROM pg_roles WHERE oid = ANY(polroles)) AS roles
  FROM pg_policy
  WHERE polrelid = 'public.profiles'::regclass
  ORDER BY polname
`);
for (const r of pol.rows) console.log(' •', r.polname, '|', r.polcmd, '| roles=', r.roles, '| qual=', r.qual, '| with=', r.withcheck);

console.log('\n--- auth.users sayım ---');
const cnt = await client.query(`SELECT count(*) AS n FROM auth.users`);
console.log('total auth users:', cnt.rows[0].n);

console.log('\n--- profiles vs auth.users orphan kontrolü ---');
const orphans = await client.query(`
  SELECT p.id, p.email, p.username, p.tenant_id
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE u.id IS NULL
  LIMIT 30
`);
console.log('auth.users\'da olmayan profile sayısı:', orphans.rows.length);
console.table(orphans.rows);

const orphans2 = await client.query(`
  SELECT u.id, u.email, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
  LIMIT 30
`);
console.log('\nprofile\'sız auth user sayısı:', orphans2.rows.length);
console.table(orphans2.rows);

await client.end();
