import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({
  host: url.hostname, port: Number(url.port),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.replace('/', ''), ssl: { rejectUnauthorized: false },
});
await client.connect();

console.log('=== branches durumu ===');
const br = await client.query(`
  SELECT id, name, tenant_id, is_active, menu_enabled
    FROM public.branches
   WHERE tenant_id='11111111-1111-1111-1111-111111111111'
   ORDER BY is_main DESC NULLS LAST, name
`);
console.table(br.rows);

console.log('\n=== waiter_calls policies ===');
const pol = await client.query(`
  SELECT policyname, cmd, roles, qual::text AS qual, with_check::text AS wc
    FROM pg_policies WHERE schemaname='public' AND tablename='waiter_calls'
`);
for (const p of pol.rows) console.log(`- ${p.policyname} (${p.cmd}) roles=${p.roles}\n   wc: ${p.wc}\n   q : ${p.qual}`);

console.log('\n=== branches policies (anon ilgili) ===');
const bp = await client.query(`
  SELECT policyname, cmd, roles, qual::text AS qual
    FROM pg_policies
   WHERE schemaname='public' AND tablename='branches'
     AND ('anon' = ANY(roles) OR roles::text ILIKE '%public%')
`);
for (const p of bp.rows) console.log(`- ${p.policyname} (${p.cmd}) roles=${p.roles}\n   q: ${p.qual}`);

console.log('\n=== anon olarak INSERT denemesi ===');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const branchId = br.rows[0]?.id;
const tenantId = br.rows[0]?.tenant_id;
console.log('Hedef branch:', branchId, 'tenant:', tenantId);
const ins = await sb.from('waiter_calls').insert({
  tenant_id: tenantId, branch_id: branchId,
  table_label: 'TEST-MASA-DEBUG', call_type: 'service', status: 'pending',
}).select('id').single();
console.log('Insert result:', JSON.stringify(ins, null, 2));

if (ins.data?.id) {
  await client.query('DELETE FROM public.waiter_calls WHERE id=$1', [ins.data.id]);
  console.log('Test kaydı temizlendi.');
}

await client.end();
