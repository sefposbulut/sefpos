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

console.log('--- waiters RLS policies ---');
const r1 = await c.query(`
  SELECT polname, polcmd,
         pg_get_expr(polqual, polrelid)      AS using_expr,
         pg_get_expr(polwithcheck, polrelid) AS check_expr,
         polroles
  FROM pg_policy
  WHERE polrelid = 'public.waiters'::regclass
  ORDER BY polname
`);
console.log(JSON.stringify(r1.rows, null, 2));

console.log('\n--- waiters table grants ---');
const r2 = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'waiters'
  ORDER BY grantee, privilege_type
`);
console.table(r2.rows);

console.log('\n--- helper funcs is_admin / is_branch_manager / has_permission ---');
const r3 = await c.query(`
  SELECT proname, pg_get_function_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND proname IN ('is_admin','is_branch_manager','has_permission','can_manage_waiters')
`);
console.table(r3.rows);

await c.end();
