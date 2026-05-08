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

console.log('--- device_bindings policies ---');
const r = await c.query(`
  SELECT polname, polcmd,
         pg_get_expr(polqual, polrelid) AS using_expr,
         pg_get_expr(polwithcheck, polrelid) AS check_expr
  FROM pg_policy WHERE polrelid='public.device_bindings'::regclass
  ORDER BY polname
`);
console.log(JSON.stringify(r.rows, null, 2));

console.log('\n--- device_bindings rows ---');
const r2 = await c.query(`
  SELECT id, device_id, waiter_id, tenant_id, status FROM public.device_bindings ORDER BY registered_at DESC LIMIT 20
`);
console.table(r2.rows);

await c.end();
