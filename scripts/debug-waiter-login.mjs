import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const u = new URL(process.env.DATABASE_URL);
const c = new pg.Client({
  host: u.hostname, port: +u.port,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log('=== device_binding_requests son kayitlar ===');
const r1 = await c.query(`
  SELECT id, waiter_id, device_id, status, created_at, accepted_at
    FROM public.device_binding_requests
   ORDER BY created_at DESC LIMIT 8
`);
console.table(r1.rows);

console.log('\n=== device_bindings son kayitlar ===');
const r2 = await c.query(`
  SELECT id, waiter_id, device_id, tenant_id, status
    FROM public.device_bindings
   ORDER BY id DESC LIMIT 8
`);
console.table(r2.rows);

console.log('\n=== device_bindings columns ===');
const cols = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='device_bindings'
   ORDER BY ordinal_position
`);
console.table(cols.rows);

console.log('\n=== waiters tablosu ===');
const r3 = await c.query(`
  SELECT id, name, phone, status, tenant_id
    FROM public.waiters
   ORDER BY created_at DESC LIMIT 8
`);
console.table(r3.rows);

for (const t of ['device_binding_requests', 'device_bindings', 'waiters']) {
  console.log(`\n=== ${t} policies (anon) ===`);
  const p = await c.query(`
    SELECT policyname, cmd, roles::text, qual::text AS qual
      FROM pg_policies
     WHERE schemaname='public' AND tablename=$1
       AND ('anon' = ANY(roles) OR roles::text ILIKE '%public%')
  `, [t]);
  if (p.rows.length === 0) console.log('  (anon policy yok)');
  for (const x of p.rows) console.log(`  - ${x.policyname} | ${x.cmd} | ${x.roles} | ${x.qual}`);

  const g = await c.query(`
    SELECT grantee, string_agg(privilege_type, ',') AS privs
      FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=$1
       AND grantee IN ('anon','authenticated')
     GROUP BY grantee
  `, [t]);
  console.log('  GRANT:', g.rows);
}

console.log('\n=== anon SELECT bindings denemesi (en son request) ===');
if (r1.rows.length > 0) {
  const last = r1.rows[0];
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const sel = await sb.from('device_binding_requests').select('id, status').eq('id', last.id).maybeSingle();
  console.log('anon SELECT request:', JSON.stringify(sel, null, 2));
  const bs = await sb.from('device_bindings').select('id, status').eq('waiter_id', last.waiter_id);
  console.log('anon SELECT bindings:', JSON.stringify(bs, null, 2));
}

await c.end();
