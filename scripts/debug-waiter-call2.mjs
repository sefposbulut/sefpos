import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const branchId = '22222222-2222-2222-2222-222222222222';
const tenantId = '11111111-1111-1111-1111-111111111111';

console.log('=== anon olarak branches goruyor mu? ===');
const r1 = await sb
  .from('branches')
  .select('id, name, tenant_id, is_active, menu_enabled')
  .eq('id', branchId);
console.log(JSON.stringify(r1, null, 2));

console.log('\n=== tum aktif anon branches ===');
const r2 = await sb
  .from('branches')
  .select('id, name, tenant_id, is_active, menu_enabled')
  .eq('tenant_id', tenantId);
console.log(JSON.stringify(r2, null, 2));

// pg ile RLS bypass et ve direkt INSERT dene
const u = new URL(process.env.DATABASE_URL);
const c = new pg.Client({
  host: u.hostname, port: +u.port,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log('\n=== service_role ile INSERT dener (bypass RLS): ===');
try {
  const r3 = await c.query(`
    INSERT INTO public.waiter_calls (tenant_id, branch_id, table_label, call_type, status)
    VALUES ($1, $2, 'PG-DEBUG', 'service', 'pending')
    RETURNING id
  `, [tenantId, branchId]);
  console.log('OK:', r3.rows[0].id);
  await c.query('DELETE FROM public.waiter_calls WHERE id=$1', [r3.rows[0].id]);
} catch (e) {
  console.log('HATA:', e.message);
}

console.log('\n=== anon role context ile branches okumayi simule et ===');
try {
  await c.query(`SET LOCAL ROLE anon`);
  const r = await c.query(`
    SELECT EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = $1
        AND b.tenant_id = $2
        AND b.is_active = TRUE
        AND COALESCE(b.menu_enabled, TRUE) = TRUE
    ) AS visible
  `, [branchId, tenantId]);
  console.log('anon EXISTS:', r.rows[0].visible);

  const cnt = await c.query(`SELECT count(*) FROM public.branches`);
  console.log('anon SELECT count(branches):', cnt.rows[0].count);

  await c.query(`RESET ROLE`);
} catch (e) {
  console.log('HATA:', e.message);
  try { await c.query('RESET ROLE'); } catch {}
}

await c.end();
