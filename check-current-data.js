const { createClient } = require('@supabase/supabase-js');

// Eski Supabase veritabanına bağlan
const supabase = createClient(
  'https://orlydeyxshsdusxukhuu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybHlkZXl4c2hzZHVzeHVraHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ3ODI4MDAsImV4cCI6MjA0MDM1ODgwMH0.B1JQk3iEhN2s6nTnI3xQlTqJw8YfJdRkLmN9PqXsYt8'
);

async function checkCurrentData() {
  console.log('🔍 Eski Supabase veritabanını kontrol ediyorum...\n');

  try {
    // Demo tenant'ı bul
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', 'sefpos-demo')
      .single();

    if (tenantError) {
      console.log('❌ Demo tenant bulunamadı:', tenantError.message);
      return;
    }

    console.log('✅ Demo tenant bulundu:', tenant.name);
    console.log('📊 Tenant ID:', tenant.id);

    // Masaları kontrol et
    const { data: tables, error: tablesError } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('table_number');

    if (tablesError) {
      console.log('❌ Masalar alınamadı:', tablesError.message);
      return;
    }

    console.log(`\n🪑 Mevcut masa sayısı: ${tables.length}`);
    console.log('📍 Masalar:', tables.map(t => `${t.table_number}(${t.status})`).join(', '));

    // Masa gruplarını kontrol et
    const { data: groups, error: groupsError } = await supabase
      .from('table_groups')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (groupsError) {
      console.log('❌ Masa grupları alınamadı:', groupsError.message);
    } else {
      console.log(`\n🎯 Masa grupları: ${groups.length}`);
      console.log('📍 Gruplar:', groups.map(g => `${g.name}(${g.color})`).join(', '));
    }

    // Kategorileri kontrol et
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order');

    if (categoriesError) {
      console.log('❌ Kategoriler alınamadı:', categoriesError.message);
    } else {
      console.log(`\n📋 Mevcut kategori sayısı: ${categories.length}`);
      console.log('📍 Kategoriler:', categories.map(c => c.name).join(', '));
    }

    // Ürünleri kontrol et
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .limit(50);

    if (productsError) {
      console.log('❌ Ürünler alınamadı:', productsError.message);
    } else {
      console.log(`\n🍽️ Mevcut ürün sayısı: ${products.length}`);
      console.log('📍 Ürünler:', products.map(p => `${p.name}(${p.price}₺)`).join(', '));
    }

    // Kullanıcıları kontrol et
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true);

    if (usersError) {
      console.log('❌ Kullanıcılar alınamadı:', usersError.message);
    } else {
      console.log(`\n👥 Mevcut kullanıcı sayısı: ${users.length}`);
      console.log('📍 Kullanıcılar:', users.map(u => `${u.full_name}(${u.email})`).join(', '));
    }

    // Öneriler
    console.log('\n💡 ÖNERİLER:');
    if (tables.length < 20) {
      console.log(`🪑 ${20 - tables.length} masa daha eklenmeli`);
    }
    if (categories.length < 10) {
      console.log(`📋 ${10 - categories.length} kategori daha eklenmeli`);
    }
    if (products.length < 20) {
      console.log(`🍽️ ${20 - products.length} ürün daha eklenmeli`);
    }

  } catch (error) {
    console.error('❌ Genel hata:', error.message);
  }
}

checkCurrentData().then(() => {
  console.log('\n✅ Kontrol tamamlandı');
  process.exit(0);
});
