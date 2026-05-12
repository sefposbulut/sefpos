import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(url, anon, { auth: { persistSession: false } });

const r = await sb.auth.signInWithPassword({ email: 'info@sefpos.com.tr', password: '2128948++' });
if (r.error) {
  console.error('signin hata:', r.error);
  process.exit(1);
}
console.log('signin OK', r.data.user.id);
const TENANT = '11111111-1111-1111-1111-111111111111';
const BRANCH = '22222222-2222-2222-2222-222222222222';

const prof = await sb.from('profiles').select('*').eq('id', r.data.user.id).maybeSingle();
console.log('profile:', prof.error ? prof.error : prof.data);

const tens = await sb.from('tenants').select('id, name, slug').eq('id', TENANT).maybeSingle();
console.log('tenant:', tens.error ? tens.error : tens.data);

const br = await sb.from('branches').select('id, name, is_main, is_active').eq('tenant_id', TENANT);
console.log('branches:', br.error ? br.error : br.data);

const tg = await sb.from('table_groups').select('id, name, color, branch_id, prefix').eq('tenant_id', TENANT).or(`branch_id.eq.${BRANCH},branch_id.is.null`);
console.log('table_groups:', tg.error ? tg.error : tg.data?.length, tg.data);

const rt = await sb.from('restaurant_tables').select('id, table_number, branch_id, group_id, status').eq('tenant_id', TENANT).eq('branch_id', BRANCH);
console.log('restaurant_tables:', rt.error ? rt.error : rt.data?.length);

const rtJoin = await sb.from('restaurant_tables').select(`
  id, table_number, status, current_order_id, session_start,
  group_id, tenant_id, branch_id, created_at, capacity, size, payment_locked,
  orders!restaurant_tables_current_order_id_fkey(
    id, total_amount, order_number, payment_status
  )
`).eq('tenant_id', TENANT).eq('branch_id', BRANCH);
console.log('restaurant_tables (joined):', rtJoin.error ? rtJoin.error : rtJoin.data?.length);

const cats = await sb.from('categories').select('id, name, color, tenant_id').eq('tenant_id', TENANT);
console.log('categories:', cats.error ? cats.error : cats.data?.length);

const prods = await sb.from('products').select('id, name, price, cost, category_id, is_active, image_url, barcode, printer_name, unit, stock_quantity, tax_rate, scale_enabled').eq('tenant_id', TENANT).eq('is_active', true);
console.log('products:', prods.error ? prods.error : prods.data?.length);

const tgEmbed = await sb.from('table_groups').select('*, branches(id, name, is_main)').eq('tenant_id', TENANT).eq('branch_id', BRANCH);
console.log('table_groups embed branches:', tgEmbed.error ? tgEmbed.error.message : tgEmbed.data?.length);

const oiSel =
  'id, tenant_id, order_id, product_id, variant_id, variant_name, quantity, unit_price, tax_rate, discount_amount, total_amount, notes, created_at, products(id, name, price, category_id, tax_rate, unit, barcode, printer_name, scale_enabled, categories(vat_rate, hugin_department_id, name))';
const oi = await sb.from('order_items').select(oiSel).eq('tenant_id', TENANT).limit(1);
console.log('order_items panel select:', oi.error ? oi.error.message : oi.data?.length);

// Yazıcı bulutu: tablo PostgREST'te var mı + RLS (oturum açıkken)
const psBranch = await sb
  .from('print_settings')
  .select('id, updated_at')
  .eq('tenant_id', TENANT)
  .eq('branch_id', BRANCH)
  .maybeSingle();
console.log(
  'print_settings (branch):',
  psBranch.error
    ? { message: psBranch.error.message, code: psBranch.error.code, details: psBranch.error.details }
    : psBranch.data ?? '(satır yok — tablo OK, kayıt sonra eklenebilir)',
);

const psTenant = await sb
  .from('print_settings')
  .select('id, updated_at')
  .eq('tenant_id', TENANT)
  .is('branch_id', null)
  .maybeSingle();
console.log(
  'print_settings (tenant-wide branch null):',
  psTenant.error
    ? { message: psTenant.error.message, code: psTenant.error.code }
    : psTenant.data ?? '(satır yok)',
);

const pj = await sb.from('print_jobs').select('id, status, created_at').eq('tenant_id', TENANT).limit(3);
console.log(
  'print_jobs (son 3):',
  pj.error ? { message: pj.error.message, code: pj.error.code } : (pj.data?.length ?? 0) + ' satır',
);

await sb.auth.signOut();
