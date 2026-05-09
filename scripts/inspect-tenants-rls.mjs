import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[t.slice(0, i).trim()] = v;
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log('--- tenants policies ---');
const pol = await c.query(`
  SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_clause
  FROM pg_policy WHERE polrelid = 'public.tenants'::regclass
  ORDER BY polname
`);
console.table(pol.rows);

console.log('--- profiles cols (role, is_super_admin, role_id) ---');
const cols = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles'
    AND column_name IN ('role','is_super_admin','role_id')
`);
console.table(cols.rows);

console.log('--- roles tablosu var mi? ---');
const rolesTable = await c.query(`SELECT to_regclass('public.roles') AS exists`);
console.log(rolesTable.rows);

console.log('--- super admin profilleri ---');
const sa = await c.query(`
  SELECT id, email, role,
         COALESCE(is_super_admin, false) AS is_super_admin
  FROM public.profiles
  WHERE role = 'super_admin' OR is_super_admin = true
  LIMIT 10
`);
console.table(sa.rows);

await c.end();
