# Order Items Tablosu Düzeltme Kılavuzu

## 🔍 Sorun
Sipariş eklenirken hata oluşuyor:
```
Could not find the 'discount_amount' column of 'order_items' in the schema cache
```

## 🛠️ Çözüm

### Yöntem 1: Supabase SQL Editor (Önerilen)
1. [Supabase Dashboard](https://supabase.com/dashboard) açın
2. Proje: `xdfnozfuuzctubijbnds`
3. **SQL Editor** gidin
4. Aşağıdaki SQL komutunu çalıştırın:

```sql
-- Eksik kolonları ekle
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0;

-- Varsayılan değerleri güncelle
UPDATE public.order_items SET discount_amount = 0 WHERE discount_amount IS NULL;
UPDATE public.order_items SET total_amount = 0 WHERE total_amount IS NULL;
```

### Yöntem 2: Komple Tablo Yapısı
Eğer tablo tamamen boşsa veya yeniden oluşturmak istenirse:

```sql
-- Mevcut tabloyu sil (VERİLERİ SİLENECEK!)
DROP TABLE IF EXISTS public.order_items;

-- Yeni tablo oluştur
CREATE TABLE public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) GENERATED ALWAYS AS (quantity * price - discount_amount) STORED,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index'ler
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items(product_id);

-- RLS'i devre dışı bırak (geçici)
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
```

## 🧪 Test

SQL komutları çalıştırdıktan sonra:
```bash
cd c:/sefpos
node fix-order-items.cjs
```

## 📊 Beklenen Sonuç
- ✅ `discount_amount` kolonu mevcut
- ✅ `total_amount` kolonu mevcut
- ✅ Sipariş ekleme çalışıyor
- ✅ İndirim hesaplaması çalışıyor

## ⚠️ Notlar
- Bu değişiklikler mevcut verileri etkileyebilir
- Production'da önce yedek alın
- RLS devre dışı bırakılmış olabilir (demo için uygun)
