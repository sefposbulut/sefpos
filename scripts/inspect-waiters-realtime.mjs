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

console.log('--- realtime publication tables ---');
const r1 = await c.query(`
  SELECT schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  ORDER BY tablename
`);
console.table(r1.rows);

console.log('\n--- waiters table replica identity ---');
const r2 = await c.query(`
  SELECT relname,
         CASE relreplident
           WHEN 'd' THEN 'default'
           WHEN 'n' THEN 'nothing'
           WHEN 'f' THEN 'full'
           WHEN 'i' THEN 'index'
         END AS replica_identity
  FROM pg_class
  WHERE relname IN ('waiters','device_bindings','device_binding_requests')
    AND relnamespace = 'public'::regnamespace
`);
console.table(r2.rows);

console.log('\n--- waiters status of recent rows ---');
const r3 = await c.query(`
  SELECT id, name, phone, status, tenant_id, created_at
  FROM public.waiters
  ORDER BY created_at DESC NULLS LAST
  LIMIT 10
`);
console.table(r3.rows);

await c.end();
