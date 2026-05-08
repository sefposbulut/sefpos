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

console.log('--- profiles.role distribution ---');
const r1 = await c.query(`SELECT role, COUNT(*) AS n FROM public.profiles GROUP BY role ORDER BY n DESC NULLS LAST`);
console.table(r1.rows);

console.log('--- profiles vs role names (recent 25) ---');
const r2 = await c.query(`
  SELECT p.id, p.email, p.full_name, p.role AS role_text, r.name AS role_name, p.is_active, p.is_super_admin, p.tenant_id
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 25
`);
console.table(r2.rows);

console.log('--- role_text_from_role_id function exists? ---');
const r3 = await c.query(`
  SELECT proname FROM pg_proc WHERE proname = 'role_text_from_role_id'
`);
console.log(r3.rows);

console.log('--- profiles_role_text_sync trigger exists? ---');
const r4 = await c.query(`
  SELECT tgname FROM pg_trigger WHERE tgname = 'profiles_role_text_sync'
`);
console.log(r4.rows);

await c.end();
