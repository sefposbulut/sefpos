# RLS (Row Level Security) Devre Dışı Bırakma Kılavuzu

## 🔍 Durum
ŞefPOS demo verileri oluşturulurken RLS politikaları engel oluyor. Anonim kullanıcılar tablolara veri ekleyemiyor.

## 🛠️ Çözüm Yöntemleri

### Yöntem 1: Supabase Dashboard (Önerilen)
1. [Supabase Dashboard](https://supabase.com/dashboard) açın
2. Proje seçin: `xdfnozfuuzctubijbnds` (ŞefPOS birincil — AGENTS.md)
3. **Authentication** → **Policies** gidin
4. Aşağıdaki tablolarda RLS'i devre dışı bırakın:
   - `tenants`
   - `branches` 
   - `table_groups`
   - `restaurant_tables`
   - `categories`
   - `products`
   - `orders`
   - `order_items`

### Yöntem 2: SQL Editor
1. Supabase Dashboard → **SQL Editor** açın
2. Aşağıdaki SQL komutunu çalıştırın:

```sql
-- RLS'i devre dışı bırak
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;

-- Mevcut politikaları sil
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Users can insert own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Users can update own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Users can delete own tenant" ON public.tenants;
```

### Yöntem 3: Service Key ile Script
1. Supabase Dashboard → **Settings** → **API**
2. `service_role` key'i kopyalayın
3. Script'i service key ile çalıştırın

## 🚀 Sonrası

RLS devre dışı bırakıldıktan sonra:
```bash
cd c:/sefpos
node create-demo-data.cjs
```

## 📊 Beklenen Sonuç
- ✅ 20 masa (10 Salon + 10 Bahçe)
- ✅ 10 kategori (Çorbalar, Salatalar, vb.)
- ✅ 20+ ürün (Fiyatlandırılmış)
- ✅ Demo kullanıcı: `info@sefpos.com.tr` / `2128948++`

## ⚠️ Güvenlik Notu
Bu sadece demo/test ortamı içindir. Production'da RLS aktif olmalıdır.
