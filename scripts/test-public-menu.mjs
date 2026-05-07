import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('VITE_SUPABASE_URL veya VITE_SUPABASE_ANON_KEY .env\'de yok.');
  process.exit(1);
}

const sb = createClient(url, anon, { auth: { persistSession: false } });

const { data: branches } = await sb.from('branches').select('id, name, tenant_id, is_active, menu_enabled').limit(5);
console.log('\n[anon] branches (ilk 5):');
console.table(branches || []);

// Demo tenant'ı önceliklendir
const demoBranch = (branches || []).find(b => b.tenant_id === '11111111-1111-1111-1111-111111111111');
if (branches && branches.length > 0) {
  const b = demoBranch || branches[0];
  console.log(`\nTest branch: ${b.id} (${b.name}) tenant=${b.tenant_id}`);

  const { data: cats, error: ce } = await sb.from('categories')
    .select('id, name, color, menu_visible')
    .eq('tenant_id', b.tenant_id)
    .limit(5);
  console.log('[anon] categories:', ce ? `HATA ${ce.message}` : `${cats?.length || 0} kategori`);

  const { data: prods, error: pe } = await sb.from('products')
    .select('id, name, price, is_active, menu_visible')
    .eq('tenant_id', b.tenant_id)
    .limit(5);
  console.log('[anon] products:', pe ? `HATA ${pe.message}` : `${prods?.length || 0} ürün`);

  if (prods && prods.length > 0) {
    const { data: vars, error: ve } = await sb.from('product_variants')
      .select('id, product_id, name, price_modifier, is_active')
      .in('product_id', prods.map(p => p.id))
      .limit(10);
    console.log('[anon] variants:', ve ? `HATA ${ve.message}` : `${vars?.length || 0} varyant`);
  }
}
