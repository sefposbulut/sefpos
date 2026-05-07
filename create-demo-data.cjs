const { createClient } = require('@supabase/supabase-js');

// Supabase veritabanına bağlan
const supabase = createClient(
  'https://xdfnozfuuzctubijbnds.supabase.co',
  'sb_publishable_4ziGGAYQkC9Is5P7leZ6VQ_WAddnGhD'
);

async function createDemoData() {
  console.log('🚀 Demo veri oluşturuluyor...\n');

  try {
    // 1. Demo tenant oluştur
    console.log('📝 1. Demo tenant oluşturuluyor...');
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
    console.log('📊 Tenant ID:', tenant.id);

    // 2. Demo branch oluştur
    console.log('\n📝 2. Demo branch oluşturuluyor...');
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
    console.log('📊 Branch ID:', branch.id);

    // 3. Masa grupları oluştur
    console.log('\n📝 3. Masa grupları oluşturuluyor...');
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

    // 4. Masaları oluştur (20 adet)
    console.log('\n📝 4. Masalar oluşturuluyor...');
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

    // 5. Kategorileri oluştur
    console.log('\n📝 5. Kategoriler oluşturuluyor...');
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

    // 6. Ürünleri oluştur
    console.log('\n📝 6. Ürünler oluşturuluyor...');
    const products = [
      // Çorbalar
      { name: 'Mercimek Çorbası', price: 85.00, cost: 25.00, category_id: createdCategories[0].id },
      { name: 'Tavuk Çorbası', price: 95.00, cost: 35.00, category_id: createdCategories[0].id },
      { name: 'Domates Çorbası', price: 90.00, cost: 30.00, category_id: createdCategories[0].id },
      
      // Salatalar
      { name: 'Çoban Salata', price: 120.00, cost: 45.00, category_id: createdCategories[1].id },
      { name: 'Sezar Salata', price: 150.00, cost: 60.00, category_id: createdCategories[1].id },
      { name: 'Greek Salata', price: 130.00, cost: 50.00, category_id: createdCategories[1].id },
      
      // Başlangıçlar
      { name: 'Hummus', price: 110.00, cost: 40.00, category_id: createdCategories[2].id },
      { name: 'Falafel', price: 125.00, cost: 45.00, category_id: createdCategories[2].id },
      { name: 'Sigara Böreği', price: 95.00, cost: 35.00, category_id: createdCategories[2].id },
      
      // Ana Yemekler
      { name: 'Beyaz Pilav', price: 75.00, cost: 20.00, category_id: createdCategories[3].id },
      { name: 'İçli Köfte', price: 140.00, cost: 55.00, category_id: createdCategories[3].id },
      { name: 'Manti', price: 175.00, cost: 70.00, category_id: createdCategories[3].id },
      
      // Izgara
      { name: 'Adana Kebap', price: 285.00, cost: 120.00, category_id: createdCategories[4].id },
      { name: 'Urfa Kebap', price: 275.00, cost: 115.00, category_id: createdCategories[4].id },
      { name: 'Lahmacun', price: 95.00, cost: 35.00, category_id: createdCategories[4].id },
      
      // Tavuk
      { name: 'Tavuk Izgara', price: 195.00, cost: 75.00, category_id: createdCategories[5].id },
      { name: 'Tavuk Şiş', price: 210.00, cost: 85.00, category_id: createdCategories[5].id },
      
      // Deniz Ürünleri
      { name: 'Izgara Balık', price: 320.00, cost: 140.00, category_id: createdCategories[6].id },
      { name: 'Karides Güveç', price: 285.00, cost: 125.00, category_id: createdCategories[6].id },
      
      // Makarnalar
      { name: 'Spaghetti Bolognese', price: 165.00, cost: 65.00, category_id: createdCategories[7].id },
      { name: 'Fettuccine Alfredo', price: 175.00, cost: 70.00, category_id: createdCategories[7].id },
      
      // Pizzalar
      { name: 'Margarita Pizza', price: 185.00, cost: 75.00, category_id: createdCategories[8].id },
      { name: 'Pepperoni Pizza', price: 205.00, cost: 85.00, category_id: createdCategories[8].id },
      
      // Tatlılar
      { name: 'Baklava', price: 95.00, cost: 40.00, category_id: createdCategories[9].id },
      { name: 'Künefe', price: 125.00, cost: 55.00, category_id: createdCategories[9].id },
      { name: 'Sütlaç', price: 75.00, cost: 25.00, category_id: createdCategories[9].id }
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

    // 7. Demo kullanıcı oluştur
    console.log('\n📝 7. Demo kullanıcı oluşturuluyor...');
    const { data: user, error: userError } = await supabase.auth.signUp({
      email: 'info@sefpos.com.tr',
      password: '2128948++',
      options: {
        data: {
          full_name: 'Demo Admin',
          role: 'admin',
          tenant_id: tenant.id
        }
      }
    });

    if (userError) {
      console.log('❌ Kullanıcı oluşturma hatası:', userError.message);
      return;
    }

    console.log('✅ Demo kullanıcı oluşturuldu');

    // 8. Ayka lisans kullanıcısı oluştur
    console.log('\n📝 8. Ayka lisans kullanıcısı oluşturuluyor...');
    const { data: aykaUser, error: aykaUserError } = await supabase.auth.signUp({
      email: 'ayka@sefpos.com',
      password: 'ayka123',
      options: {
        data: {
          full_name: 'Ayka Admin',
          role: 'admin',
          tenant_id: tenant.id
        }
      }
    });

    if (aykaUserError) {
      console.log('❌ Ayka kullanıcı oluşturma hatası:', aykaUserError.message);
      return;
    }

    console.log('✅ Ayka kullanıcı oluşturuldu');

    console.log('\n🎉 TÜM DEMO VERİLER BAŞARIYLA OLUŞTURULDU!');
    console.log('\n📊 ÖZET:');
    console.log(`🏢 Tenant: ${tenant.name}`);
    console.log(`📍 Branch: ${branch.name}`);
    console.log(`🪑 Masalar: ${createdTables.length}`);
    console.log(`🎯 Masa Grupları: ${groups.length}`);
    console.log(`📋 Kategoriler: ${createdCategories.length}`);
    console.log(`🍽️ Ürünler: ${createdProducts.length}`);
    console.log(`👥 Kullanıcılar: 2 (Demo + Ayka)`);
    
    console.log('\n🔐 Giriş Bilgileri:');
    console.log(`📧 Demo: info@sefpos.com.tr / 2128948++`);
    console.log(`🔑 Ayka: ayka@sefpos.com / ayka123`);
    
    console.log('\n🌐 Sistem kullanıma hazır!');

  } catch (error) {
    console.error('❌ Genel hata:', error.message);
  }
}

createDemoData().then(() => {
  console.log('\n✅ Demo veri oluşturma tamamlandı');
  process.exit(0);
});
