/**
 * delete_tenant_cascade RPC'sini hem service-role hem ayka super-admin
 * kullanicisi ile test eder. Olası FK / yetki / tablolardaki sorunları tespit
 * eder. Asla mevcut bir tenant'i silmez — sadece bilinmeyen tenant id ile
 * RPC akışını çalıştırır (404 / 0 satır beklenir, hata olmamali).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i <= 0) continue;
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const URL = process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

console.log('=== Test 1: Service role ile bilinmeyen tenant ===');
const fakeId = '99999999-9999-9999-9999-999999999999';
const { error: e1 } = await admin.rpc('delete_tenant_cascade', { p_tenant_id: fakeId });
console.log('hata:', e1?.message || 'yok', '| code:', e1?.code, '| details:', e1?.details, '| hint:', e1?.hint);

console.log('\n=== Test 2: Login (ayka super-admin) + RPC ===');
const ADMIN_EMAIL = 'info@aykasoft.com.tr';
const ADMIN_PWD = '2128948++';
const { data: si, error: siErr } = await anon.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PWD });
if (siErr) {
  console.error('Admin login HATA:', siErr.message);
} else {
  console.log('Admin login OK, user.id:', si.user.id);
  const authed = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${si.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: e2 } = await authed.rpc('delete_tenant_cascade', { p_tenant_id: fakeId });
  console.log('hata:', e2?.message || 'yok', '| code:', e2?.code, '| details:', e2?.details, '| hint:', e2?.hint);

  console.log('\n=== Test 3: Mevcut tenant\'larin listesi (sadece liste; SILMIYORUZ) ===');
  const { data: tenants } = await authed.from('tenants').select('id, name, subscription_status').limit(20);
  console.table(tenants);
}

console.log('\n=== Test 4: Bagli tablolar var mi (aktif tenant icin) ===');
const tenantId = '11111111-1111-1111-1111-111111111111'; // demo tenant
const tablesToCheck = [
  'orders', 'order_items', 'payment_transactions', 'cash_register_transactions',
  'credit_transactions', 'print_jobs', 'waiter_calls', 'waiter_sessions',
  'device_binding_requests', 'device_bindings', 'waiters', 'online_orders',
  'delivery_orders', 'couriers', 'customers', 'product_variants', 'products',
  'categories', 'restaurant_tables', 'table_groups', 'support_tickets',
  'support_notifications', 'qr_menu_settings', 'profiles', 'branches', 'roles', 'licenses'
];
for (const t of tablesToCheck) {
  const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (error) {
    if (error.message.includes('does not exist')) {
      console.log(`  ${t}: TABLO YOK`);
    } else {
      console.log(`  ${t}: HATA -`, error.message);
    }
  } else {
    console.log(`  ${t}: ${count} satir`);
  }
}
