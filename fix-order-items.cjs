const { createClient } = require('@supabase/supabase-js');

// Supabase veritabanına bağlan
const supabase = createClient(
  'https://xdfnozfuuzctubijbnds.supabase.co',
  'sb_publishable_4ziGGAYQkC9Is5P7leZ6VQ_WAddnGhD'
);

async function fixOrderItemsTable() {
  console.log('🔧 order_items tablosu düzeltiliyor...\n');

  try {
    // Önce tablo yapısını kontrol et
    const { data: sampleData, error: sampleError } = await supabase
      .from('order_items')
      .select('*')
      .limit(1);

    if (sampleError) {
      console.log('❌ order_items tablosu erişilemedi:', sampleError.message);
      return;
    }

    console.log('✅ order_items tablosu mevcut');

    // Mevcut kolonları tespit et
    if (sampleData && sampleData.length > 0) {
      const existingColumns = Object.keys(sampleData[0]);
      console.log('📍 Mevcut kolonlar:', existingColumns.join(', '));
      
      // discount_amount kolonunu kontrol et
      if (!existingColumns.includes('discount_amount')) {
        console.log('❌ discount_amount kolonu eksik - ekleniyor...');
        
        // SQL komutu ile kolon ekle
        const { data, error } = await supabase.rpc('exec_sql', {
          sql: 'ALTER TABLE public.order_items ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0;'
        });

        if (error) {
          console.log('❌ SQL komutu hatası:', error.message);
          console.log('\n💡 Manuel Çözüm:');
          console.log('1. Supabase Dashboard → SQL Editor açın');
          console.log('2. Şu komutu çalıştırın:');
          console.log('```sql');
          console.log('ALTER TABLE public.order_items ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0;');
          console.log('```');
        } else {
          console.log('✅ discount_amount kolonu başarıyla eklendi');
        }
      } else {
        console.log('✅ discount_amount kolonu zaten mevcut');
      }

      // Diğer eksik kolonları kontrol et
      const requiredColumns = ['id', 'order_id', 'product_id', 'quantity', 'price', 'discount_amount', 'total_amount'];
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log('❌ Eksik kolonlar:', missingColumns.join(', '));
        console.log('\n💡 Tüm eksik kolonları eklemek için:');
        console.log('```sql');
        missingColumns.forEach(col => {
          if (col === 'discount_amount') return; // zaten kontrol edildi
          console.log(`ALTER TABLE public.order_items ADD COLUMN ${col} ${getColumnType(col)};`);
        });
        console.log('```');
      }

    } else {
      console.log('📝 Tablo boş - varsayılan yapı kontrol ediliyor...');
      console.log('💡 Varsayılan kolonları eklemek için:');
      console.log('```sql');
      console.log('ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;');
      console.log('ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0;');
      console.log('```');
    }

    // Test sipariş ekleme
    console.log('\n🧪 Test sipariş ekleme...');
    const testData = {
      order_id: 'test-order-id',
      product_id: 'test-product-id',
      quantity: 1,
      price: 100.00,
      discount_amount: 0,
      total_amount: 100.00
    };

    const { data: insertData, error: insertError } = await supabase
      .from('order_items')
      .insert(testData)
      .select();

    if (insertError) {
      console.log('❌ Test sipariş ekleme hatası:', insertError.message);
    } else {
      console.log('✅ Test sipariş başarıyla eklendi');
      
      // Test verisini temizle
      await supabase
        .from('order_items')
        .delete()
        .eq('order_id', 'test-order-id');
    }

  } catch (error) {
    console.error('❌ Genel hata:', error.message);
  }
}

function getColumnType(columnName) {
  const types = {
    'id': 'UUID DEFAULT gen_random_uuid()',
    'order_id': 'UUID',
    'product_id': 'UUID',
    'quantity': 'INTEGER DEFAULT 1',
    'price': 'DECIMAL(10,2)',
    'discount_amount': 'DECIMAL(10,2) DEFAULT 0',
    'total_amount': 'DECIMAL(10,2)',
    'created_at': 'TIMESTAMP DEFAULT NOW()',
    'updated_at': 'TIMESTAMP DEFAULT NOW()'
  };
  return types[columnName] || 'TEXT';
}

fixOrderItemsTable().then(() => {
  console.log('\n✅ Düzeltme tamamlandı');
  process.exit(0);
});
