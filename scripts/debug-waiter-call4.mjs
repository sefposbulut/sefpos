import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const branchId = '22222222-2222-2222-2222-222222222222';
const tenantId = '11111111-1111-1111-1111-111111111111';

console.log('TEST 1: insert + .select() — RETURNING gerekiyor');
const r1 = await sb.from('waiter_calls').insert({
  tenant_id: tenantId, branch_id: branchId,
  table_label: 'TEST-MASA-1', call_type: 'service', status: 'pending',
}).select('id').single();
console.log(JSON.stringify(r1, null, 2));

console.log('\nTEST 2: sadece insert — RETURNING yok');
const r2 = await sb.from('waiter_calls').insert({
  tenant_id: tenantId, branch_id: branchId,
  table_label: 'TEST-MASA-2', call_type: 'service', status: 'pending',
});
console.log(JSON.stringify(r2, null, 2));

// Cleanup pg ile
import('pg').then(async ({ default: pg }) => {
  const u = new URL(process.env.DATABASE_URL);
  const c = new pg.Client({
    host: u.hostname, port: +u.port,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const del = await c.query(`DELETE FROM public.waiter_calls WHERE table_label LIKE 'TEST-MASA%' RETURNING id`);
  console.log(`\nTemizlendi: ${del.rowCount} kayit`);
  await c.end();
});
