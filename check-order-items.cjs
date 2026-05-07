const { createClient } = require('@supabase/supabase-js');

// Supabase veritabanına bağlan
const supabase = createClient(
  'https://xdfnozfuuzctubijbnds.supabase.co',
  'sb_publishable_4ziGGAYQkC9Is5P7leZ6VQ_WAddnGhD'
);

async function checkOrderItemsTable() {
  console.log('🔍 order_items tablosu kontrol ediliyor...\n');

  try {
    // Tablonun varlığını kontrol et
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ order_items tablosu erişilemedi:', error.message);
      return;
    }

    console.log('✅ order_items tablosu mevcut');

    // Tablo yapısını kontrol et
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'order_items' });

    if (columnsError) {
      console.log('❌ Kolon bilgileri alınamadı:', columnsError.message);
      
      // Alternatif: SELECT * ile kolonları tespit et
      console.log('\n📝 Mevcut kolonlar tespit ediliyor...');
      if (data && data.length > 0) {
        const existingColumns = Object.keys(data[0]);
        console.log('📍 Mevcut kolonlar:', existingColumns.join(', '));
        
        // discount_amount kolonunu kontrol et
        if (!existingColumns.includes('discount_amount')) {
          console.log('❌ discount_amount kolonu eksik');
          console.log('\n💡 Çözüm: Supabase Dashboard → SQL Editor açın ve şu komutu çalıştırın:');
          console.log('```sql');
          console.log('ALTER TABLE public.order_items ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0;');
          console.log('```');
        } else {
          console.log('✅ discount_amount kolonu mevcut');
        }
      }
      return;
    }

    console.log('✅ Kolon bilgileri alındı');
    console.log('📍 Kolonlar:', columns.map(col => col.column_name).join(', '));

  } catch (error) {
    console.error('❌ Genel hata:', error.message);
  }
}

checkOrderItemsTable().then(() => {
  console.log('\n✅ Kontrol tamamlandı');
  process.exit(0);
});
