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

console.log('--- device_bindings columns ---');
const cols = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='device_bindings'
  ORDER BY ordinal_position
`);
console.table(cols.rows);

console.log('\n--- device_bindings rows for BATUHAN ---');
const r = await c.query(`
  SELECT db.id, db.device_id, db.waiter_id, db.tenant_id, db.status,
         db.allowed_ip_prefix, db.registered_at, w.name AS waiter_name, w.status AS waiter_status
  FROM public.device_bindings db
  LEFT JOIN public.waiters w ON w.id = db.waiter_id
  WHERE db.waiter_id = '7026b03c-fdac-43be-a577-d36a325ce415'
  ORDER BY db.registered_at DESC NULLS LAST
`);
console.table(r.rows);

console.log('\n--- device_binding_requests rows for BATUHAN ---');
const r2 = await c.query(`
  SELECT id, device_id, waiter_id, tenant_id, status,
         device_info, created_at, accepted_at
  FROM public.device_binding_requests
  WHERE waiter_id = '7026b03c-fdac-43be-a577-d36a325ce415'
  ORDER BY created_at DESC NULLS LAST
  LIMIT 5
`);
console.log(JSON.stringify(r2.rows, null, 2));

await c.end();
