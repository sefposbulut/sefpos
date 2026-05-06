const { createClient } = require('@supabase/supabase-js');

// Yeni Supabase veritabanına bağlan (hwwsitusurqgpitptkuf)
const supabase = createClient(
  'https://hwwsitusurqgpitptkuf.supabase.co',
  'sb_publishable_4ziGGAYQkC9Is5P7leZ6VQ_WAddnGhD'
);

async function checkCurrentData() {
  console.log('🔍 Supabase veritabanını kontrol ediyorum...\n');

  try {
    // Tabloların varlığını kontrol et
    const tableNames = ['tenants', 'restaurant_tables', 'categories', 'products', 'users'];
    
    for (const tableName of tableNames) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`❌ ${tableName} tablosu erişilemedi:`, error.message);
        } else {
          console.log(`✅ ${tableName} tablosu mevcut`);
        }
      } catch (e) {
        console.log(`❌ ${tableName} tablosu hatası:`, e.message);
      }
    }

    // Tenant'ları listele
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug')
      .limit(10);

    if (tenantError) {
      console.log('❌ Tenant sorgu hatası:', tenantError.message);
      return;
    }

    console.log(`\n🏢 Bulunan tenant sayısı: ${tenants.length}`);
    tenants.forEach(t => {
      console.log(`📍 ${t.name} (${t.slug}) - ID: ${t.id}`);
    });

    if (tenants.length === 0) {
      console.log('❌ Hiç tenant bulunamadı, demo veri oluşturulmalı');
      return;
    }

    // İlk tenant'ı kullan
    const tenant = tenants[0];
    console.log(`\n✅ Test için tenant seçildi: ${tenant.name}`);
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
