const { createClient } = require('@supabase/supabase-js');

// Supabase veritabanına bağlan
const supabase = createClient(
  'https://hwwsitusurqgpitptkuf.supabase.co',
  'sb_publishable_4ziGGAYQkC9Is5P7leZ6VQ_WAddnGhD'
);

async function disableRLS() {
  console.log('🔓 RLS (Row Level Security) politikaları devre dışı bırakılıyor...\n');

  try {
    // RLS'i devre dışı bırak
    console.log('📝 RLS devre dışı bırakılıyor...');
    
    // Bu SQL komutu RLS'i devre dışı bırakır
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- RLS'i devre dışı bırak
        ALTER TABLE IF EXISTS public.tenants DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.branches DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.table_groups DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.restaurant_tables DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.categories DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.products DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.orders DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.order_items DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
        
        -- Mevcut politikaları sil
        DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
        DROP POLICY IF EXISTS "Users can insert own tenant" ON public.tenants;
        DROP POLICY IF EXISTS "Users can update own tenant" ON public.tenants;
        DROP POLICY IF EXISTS "Users can delete own tenant" ON public.tenants;
        
        DROP POLICY IF EXISTS "Users can view own branches" ON public.branches;
        DROP POLICY IF EXISTS "Users can insert own branches" ON public.branches;
        DROP POLICY IF EXISTS "Users can update own branches" ON public.branches;
        DROP POLICY IF EXISTS "Users can delete own branches" ON public.branches;
        
        DROP POLICY IF EXISTS "Users can view own table_groups" ON public.table_groups;
        DROP POLICY IF EXISTS "Users can insert own table_groups" ON public.table_groups;
        DROP POLICY IF EXISTS "Users can update own table_groups" ON public.table_groups;
        DROP POLICY IF EXISTS "Users can delete own table_groups" ON public.table_groups;
        
        DROP POLICY IF EXISTS "Users can view own restaurant_tables" ON public.restaurant_tables;
        DROP POLICY IF EXISTS "Users can insert own restaurant_tables" ON public.restaurant_tables;
        DROP POLICY IF EXISTS "Users can update own restaurant_tables" ON public.restaurant_tables;
        DROP POLICY IF EXISTS "Users can delete own restaurant_tables" ON public.restaurant_tables;
        
        DROP POLICY IF EXISTS "Users can view own categories" ON public.categories;
        DROP POLICY IF EXISTS "Users can insert own categories" ON public.categories;
        DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
        DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;
        
        DROP POLICY IF EXISTS "Users can view own products" ON public.products;
        DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
        DROP POLICY IF EXISTS "Users can update own products" ON public.products;
        DROP POLICY IF EXISTS "Users can delete own products" ON public.products;
        
        DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
        DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
        DROP POLICY IF EXISTS "Users can update own orders" ON public.orders;
        DROP POLICY IF EXISTS "Users can delete own orders" ON public.orders;
        
        DROP POLICY IF EXISTS "Users can view own order_items" ON public.order_items;
        DROP POLICY IF EXISTS "Users can insert own order_items" ON public.order_items;
        DROP POLICY IF EXISTS "Users can update own order_items" ON public.order_items;
        DROP POLICY IF EXISTS "Users can delete own order_items" ON public.order_items;
      `
    });

    if (error) {
      console.log('❌ RLS devre dışı bırakma hatası:', error.message);
      console.log('💡 Alternatif: Supabase dashboard üzerinden manuel olarak devre dışı bırakın');
      return;
    }

    console.log('✅ RLS başarıyla devre dışı bırakıldı');

    // Demo veri oluşturmayı dene
    console.log('\n🚀 Demo veri oluşturuluyor...');
    
    // Demo tenant oluştur
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: 'ŞefPOS Demo',
        slug: 'sefpos-demo',
        email: 'info@sefpos.com.tr',
        phone: '+90 212 894 8989',
        address: 'İstanbul, Türkiye',
        subscription_plan: 'premium',
        subscription_status: 'active',
        subscription_expires_at: new Date('2026-12-31').toISOString(),
        max_branches: 5,
        notes: 'Demo tenant for testing',
        onboarding_completed: true,
        deployment_mode: 'cloud',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (tenantError) {
      console.log('❌ Tenant oluşturma hatası:', tenantError.message);
      return;
    }

    console.log('✅ Tenant oluşturuldu:', tenant.name);

    // Demo branch oluştur
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .insert({
        tenant_id: tenant.id,
        name: 'Demo Şube',
        address: 'Demo Adres',
        phone: '+90 212 894 8989',
        email: 'demo@sefpos.com.tr',
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (branchError) {
      console.log('❌ Branch oluşturma hatası:', branchError.message);
      return;
    }

    console.log('✅ Branch oluşturuldu:', branch.name);

    // Masa grupları oluştur
    const { data: groups, error: groupsError } = await supabase
      .from('table_groups')
      .insert([
        {
          tenant_id: tenant.id,
          branch_id: branch.id,
          name: 'Salon',
          color: '#3B82F6',
          created_at: new Date().toISOString()
        },
        {
          tenant_id: tenant.id,
          branch_id: branch.id,
          name: 'Bahçe',
          color: '#10B981',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (groupsError) {
      console.log('❌ Masa grupları oluşturma hatası:', groupsError.message);
      return;
    }

    console.log('✅ Masa grupları oluşturuldu:', groups.length);

    // Masaları oluştur (20 adet)
    const tables = [];
    for (let i = 1; i <= 20; i++) {
      const groupId = i <= 10 ? groups[0].id : groups[1].id;
      tables.push({
        tenant_id: tenant.id,
        branch_id: branch.id,
        table_number: i.toString(),
        capacity: 4,
        size: 'medium',
        status: 'available',
        group_id: groupId,
        created_at: new Date().toISOString()
      });
    }

    const { data: createdTables, error: tablesError } = await supabase
      .from('restaurant_tables')
      .insert(tables)
      .select();

    if (tablesError) {
      console.log('❌ Masalar oluşturma hatası:', tablesError.message);
      return;
    }

    console.log('✅ Masalar oluşturuldu:', createdTables.length);

    // Kategorileri oluştur
    const categories = [
      { name: 'Çorbalar', color: '#F59E0B', sort_order: 1 },
      { name: 'Salatalar', color: '#10B981', sort_order: 2 },
      { name: 'Başlangıçlar', color: '#EF4444', sort_order: 3 },
      { name: 'Ana Yemekler', color: '#3B82F6', sort_order: 4 },
      { name: 'Izgara', color: '#6366F1', sort_order: 5 },
      { name: 'Tavuk', color: '#F97316', sort_order: 6 },
      { name: 'Deniz Ürünleri', color: '#06B6D4', sort_order: 7 },
      { name: 'Makarnalar', color: '#8B5CF6', sort_order: 8 },
      { name: 'Pizzalar', color: '#EC4899', sort_order: 9 },
      { name: 'Tatlılar', color: '#84CC16', sort_order: 10 }
    ].map((cat, index) => ({
      tenant_id: tenant.id,
      name: cat.name,
      color: cat.color,
      sort_order: cat.sort_order,
      created_at: new Date().toISOString()
    }));

    const { data: createdCategories, error: categoriesError } = await supabase
      .from('categories')
      .insert(categories)
      .select();

    if (categoriesError) {
      console.log('❌ Kategoriler oluşturma hatası:', categoriesError.message);
      return;
    }

    console.log('✅ Kategoriler oluşturuldu:', createdCategories.length);

    // Ürünleri oluştur
    const products = [
      { name: 'Mercimek Çorbası', price: 85.00, cost: 25.00, category_id: createdCategories[0].id },
      { name: 'Tavuk Çorbası', price: 95.00, cost: 35.00, category_id: createdCategories[0].id },
      { name: 'Domates Çorbası', price: 90.00, cost: 30.00, category_id: createdCategories[0].id },
      { name: 'Çoban Salata', price: 120.00, cost: 45.00, category_id: createdCategories[1].id },
      { name: 'Sezar Salata', price: 150.00, cost: 60.00, category_id: createdCategories[1].id },
      { name: 'Greek Salata', price: 130.00, cost: 50.00, category_id: createdCategories[1].id },
      { name: 'Hummus', price: 110.00, cost: 40.00, category_id: createdCategories[2].id },
      { name: 'Falafel', price: 125.00, cost: 45.00, category_id: createdCategories[2].id },
      { name: 'Sigara Böreği', price: 95.00, cost: 35.00, category_id: createdCategories[2].id },
      { name: 'Beyaz Pilav', price: 75.00, cost: 20.00, category_id: createdCategories[3].id },
      { name: 'İçli Köfte', price: 140.00, cost: 55.00, category_id: createdCategories[3].id },
      { name: 'Manti', price: 175.00, cost: 70.00, category_id: createdCategories[3].id },
      { name: 'Adana Kebap', price: 285.00, cost: 120.00, category_id: createdCategories[4].id },
      { name: 'Urfa Kebap', price: 275.00, cost: 115.00, category_id: createdCategories[4].id },
      { name: 'Lahmacun', price: 95.00, cost: 35.00, category_id: createdCategories[4].id },
      { name: 'Tavuk Izgara', price: 195.00, cost: 75.00, category_id: createdCategories[5].id },
      { name: 'Tavuk Şiş', price: 210.00, cost: 85.00, category_id: createdCategories[5].id },
      { name: 'Izgara Balık', price: 320.00, cost: 140.00, category_id: createdCategories[6].id },
      { name: 'Karides Güveç', price: 285.00, cost: 125.00, category_id: createdCategories[6].id }
    ].map(product => ({
      tenant_id: tenant.id,
      name: product.name,
      price: product.price,
      cost: product.cost,
      category_id: product.category_id,
      is_active: true,
      created_at: new Date().toISOString()
    }));

    const { data: createdProducts, error: productsError } = await supabase
      .from('products')
      .insert(products)
      .select();

    if (productsError) {
      console.log('❌ Ürünler oluşturma hatası:', productsError.message);
      return;
    }

    console.log('✅ Ürünler oluşturuldu:', createdProducts.length);

    console.log('\n🎉 TÜM DEMO VERİLER BAŞARIYLA OLUŞTURULDU!');
    console.log('\n📊 ÖZET:');
    console.log(`🏢 Tenant: ${tenant.name}`);
    console.log(`📍 Branch: ${branch.name}`);
    console.log(`🪑 Masalar: ${createdTables.length}`);
    console.log(`🎯 Masa Grupları: ${groups.length}`);
    console.log(`📋 Kategoriler: ${createdCategories.length}`);
    console.log(`🍽️ Ürünler: ${createdProducts.length}`);
    
    console.log('\n🔐 Giriş Bilgileri:');
    console.log(`📧 Demo: info@sefpos.com.tr / 2128948++`);
    
    console.log('\n🌐 Sistem kullanıma hazır!');

  } catch (error) {
    console.error('❌ Genel hata:', error.message);
  }
}

disableRLS().then(() => {
  console.log('\n✅ RLS devre dışı bırakma ve demo veri oluşturma tamamlandı');
  process.exit(0);
});
