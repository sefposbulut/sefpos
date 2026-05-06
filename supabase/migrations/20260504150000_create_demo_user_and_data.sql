-- ============================================================
-- DEMO KULLANICI VE VERİLERİ
-- info@sefpos.com.tr / 2128948++
-- ============================================================

-- Demo tenant oluştur (eğer yoksa)
INSERT INTO tenants (id, name, slug, email, subscription_status, onboarding_completed)
SELECT 
  '11111111-1111-1111-1111-111111111111'::uuid,
  'ŞefPOS Demo Restaurant',
  'sefpos-demo',
  'info@sefpos.com.tr',
  'active',
  true
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'sefpos-demo');

-- Demo şube oluştur
INSERT INTO branches (id, tenant_id, name, is_main, is_active)
SELECT 
  '22222222-2222-2222-2222-222222222222'::uuid,
  t.id,
  'Ana Şube',
  true,
  true
FROM tenants t
WHERE t.slug = 'sefpos-demo'
AND NOT EXISTS (SELECT 1 FROM branches WHERE tenant_id = t.id AND is_main = true);

-- Demo kullanıcı oluştur
INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT 
  '33333333-3333-3333-3333-333333333333'::uuid,
  'info@sefpos.com.tr',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'info@sefpos.com.tr');

-- Profile oluştur
INSERT INTO profiles (id, tenant_id, branch_id, email, full_name, role, onboarding_completed)
SELECT 
  u.id,
  t.id,
  b.id,
  u.email,
  'Demo Yönetici',
  'owner',
  true
FROM auth.users u
JOIN tenants t ON t.slug = 'sefpos-demo'
JOIN branches b ON b.tenant_id = t.id AND b.is_main = true
WHERE u.email = 'info@sefpos.com.tr'
AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = u.id);

-- Masa grupları
INSERT INTO table_groups (id, tenant_id, name, color, prefix)
SELECT 
  gen_random_uuid(),
  t.id,
  g.name,
  g.color,
  g.prefix
FROM tenants t
CROSS JOIN (VALUES 
  ('Salon', '#3B82F6', 'S'),
  ('Bahçe', '#10B981', 'B')
) AS g(name, color, prefix)
WHERE t.slug = 'sefpos-demo'
AND NOT EXISTS (
  SELECT 1 FROM table_groups tg 
  WHERE tg.tenant_id = t.id AND tg.name = g.name
);

-- Masaları oluştur (20 masa)
INSERT INTO restaurant_tables (id, tenant_id, branch_id, table_number, capacity, size, group_id, status)
SELECT 
  gen_random_uuid(),
  t.id,
  b.id,
  n.table_number::text,
  n.capacity,
  n.size,
  tg.id,
  'available'
FROM tenants t
JOIN branches b ON b.tenant_id = t.id AND b.is_main = true
JOIN table_groups tg ON tg.tenant_id = t.id
CROSS JOIN (VALUES 
  (1, 4, 'medium', 'Salon'),
  (2, 4, 'medium', 'Salon'),
  (3, 2, 'small', 'Salon'),
  (4, 6, 'large', 'Salon'),
  (5, 4, 'medium', 'Salon'),
  (6, 4, 'medium', 'Salon'),
  (7, 2, 'small', 'Salon'),
  (8, 6, 'large', 'Salon'),
  (9, 4, 'medium', 'Salon'),
  (10, 4, 'medium', 'Salon'),
  (11, 4, 'medium', 'Bahçe'),
  (12, 6, 'large', 'Bahçe'),
  (13, 4, 'medium', 'Bahçe'),
  (14, 2, 'small', 'Bahçe'),
  (15, 4, 'medium', 'Bahçe'),
  (16, 6, 'large', 'Bahçe'),
  (17, 4, 'medium', 'Bahçe'),
  (18, 4, 'medium', 'Bahçe'),
  (19, 2, 'small', 'Bahçe'),
  (20, 6, 'large', 'Bahçe')
) AS n(table_number, capacity, size, group_name)
JOIN table_groups tg2 ON tg2.tenant_id = t.id AND tg2.name = n.group_name
WHERE t.slug = 'sefpos-demo'
AND tg.name = n.group_name
AND NOT EXISTS (
  SELECT 1 FROM restaurant_tables rt 
  WHERE rt.tenant_id = t.id AND rt.table_number = n.table_number::text
);

-- Kategorileri oluştur (şemaya göre: color/sort_order veya display_order veya yalnız name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'color'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'sort_order'
  ) THEN
    INSERT INTO categories (id, tenant_id, name, color, sort_order)
    SELECT gen_random_uuid(), t.id, c.name, c.color, c.sort_order
    FROM tenants t
    CROSS JOIN (VALUES 
      ('Çorbalar', '#EF4444', 1), ('Salatalar', '#10B981', 2), ('Başlangıçlar', '#F59E0B', 3),
      ('Ana Yemekler', '#3B82F6', 4), ('Izgara', '#DC2626', 5), ('Tavuk', '#7C3AED', 6),
      ('Deniz Ürünleri', '#0891B2', 7), ('Makarnalar', '#EC4899', 8), ('Pizzalar', '#F97316', 9),
      ('Tatlılar', '#A855F7', 10)
    ) AS c(name, color, sort_order)
    WHERE t.slug = 'sefpos-demo'
    AND NOT EXISTS (SELECT 1 FROM categories cat WHERE cat.tenant_id = t.id AND cat.name = c.name);
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'display_order'
  ) THEN
    INSERT INTO categories (id, tenant_id, name, display_order)
    SELECT gen_random_uuid(), t.id, c.name, c.sort_order
    FROM tenants t
    CROSS JOIN (VALUES 
      ('Çorbalar', '#EF4444', 1), ('Salatalar', '#10B981', 2), ('Başlangıçlar', '#F59E0B', 3),
      ('Ana Yemekler', '#3B82F6', 4), ('Izgara', '#DC2626', 5), ('Tavuk', '#7C3AED', 6),
      ('Deniz Ürünleri', '#0891B2', 7), ('Makarnalar', '#EC4899', 8), ('Pizzalar', '#F97316', 9),
      ('Tatlılar', '#A855F7', 10)
    ) AS c(name, color, sort_order)
    WHERE t.slug = 'sefpos-demo'
    AND NOT EXISTS (SELECT 1 FROM categories cat WHERE cat.tenant_id = t.id AND cat.name = c.name);
  ELSE
    INSERT INTO categories (id, tenant_id, name)
    SELECT gen_random_uuid(), t.id, c.name
    FROM tenants t
    CROSS JOIN (VALUES 
      ('Çorbalar'), ('Salatalar'), ('Başlangıçlar'), ('Ana Yemekler'), ('Izgara'), ('Tavuk'),
      ('Deniz Ürünleri'), ('Makarnalar'), ('Pizzalar'), ('Tatlılar')
    ) AS c(name)
    WHERE t.slug = 'sefpos-demo'
    AND NOT EXISTS (SELECT 1 FROM categories cat WHERE cat.tenant_id = t.id AND cat.name = c.name);
  END IF;
END $$;

-- Ürünleri oluştur
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'cost')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'barcode')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unit')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock_quantity')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tax_rate')
  THEN
    INSERT INTO products (id, tenant_id, name, price, cost, category_id, is_active, barcode, unit, stock_quantity, tax_rate)
    SELECT gen_random_uuid(), t.id, p.name, p.price, p.cost, cat.id, true, p.barcode, 'porsiyon', 100, 8
    FROM tenants t
    JOIN categories cat ON cat.tenant_id = t.id
    CROSS JOIN (VALUES 
      ('Mercimek Çorbası', 45.00, 15.00, 'Çorbalar', '8601234567890'),
      ('Yayla Çorbası', 55.00, 20.00, 'Çorbalar', '8601234567891'),
      ('Çoban Salata', 75.00, 25.00, 'Salatalar', '8601234567892'),
      ('Sezar Salata', 95.00, 35.00, 'Salatalar', '8601234567893'),
      ('Humus', 65.00, 20.00, 'Başlangıçlar', '8601234567894'),
      ('Patates Kızartması', 55.00, 15.00, 'Başlangıçlar', '8601234567895'),
      ('Kuzu Pirzola', 285.00, 120.00, 'Ana Yemekler', '8601234567896'),
      ('Etli Sarmalı Sarma', 165.00, 60.00, 'Ana Yemekler', '8601234567897'),
      ('Adana Kebap', 225.00, 80.00, 'Izgara', '8601234567898'),
      ('Urfa Kebap', 215.00, 75.00, 'Izgara', '8601234567899'),
      ('Tavuk Şiş', 185.00, 60.00, 'Tavuk', '8601234567900'),
      ('Tavuk Döner', 175.00, 55.00, 'Tavuk', '8601234567901'),
      ('Levrek Izgara', 245.00, 90.00, 'Deniz Ürünleri', '8601234567902'),
      ('Karides Güveç', 275.00, 110.00, 'Deniz Ürünleri', '8601234567903'),
      ('Spagetti Bolonez', 155.00, 45.00, 'Makarnalar', '8601234567904'),
      ('Fettuccine Alfredo', 165.00, 50.00, 'Makarnalar', '8601234567905'),
      ('Margherita', 135.00, 40.00, 'Pizzalar', '8601234567906'),
      ('Pepperoni', 155.00, 50.00, 'Pizzalar', '8601234567907'),
      ('Baklava', 85.00, 25.00, 'Tatlılar', '8601234567908'),
      ('Künefe', 95.00, 30.00, 'Tatlılar', '8601234567909')
    ) AS p(name, price, cost, category_name, barcode)
    WHERE t.slug = 'sefpos-demo' AND cat.name = p.category_name
    AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.tenant_id = t.id AND pr.name = p.name);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_available') THEN
    INSERT INTO products (id, tenant_id, name, price, category_id, is_available)
    SELECT gen_random_uuid(), t.id, p.name, p.price, cat.id, true
    FROM tenants t
    JOIN categories cat ON cat.tenant_id = t.id
    CROSS JOIN (VALUES 
      ('Mercimek Çorbası', 45.00, 'Çorbalar'), ('Yayla Çorbası', 55.00, 'Çorbalar'),
      ('Çoban Salata', 75.00, 'Salatalar'), ('Sezar Salata', 95.00, 'Salatalar'),
      ('Humus', 65.00, 'Başlangıçlar'), ('Patates Kızartması', 55.00, 'Başlangıçlar'),
      ('Kuzu Pirzola', 285.00, 'Ana Yemekler'), ('Etli Sarmalı Sarma', 165.00, 'Ana Yemekler'),
      ('Adana Kebap', 225.00, 'Izgara'), ('Urfa Kebap', 215.00, 'Izgara'),
      ('Tavuk Şiş', 185.00, 'Tavuk'), ('Tavuk Döner', 175.00, 'Tavuk'),
      ('Levrek Izgara', 245.00, 'Deniz Ürünleri'), ('Karides Güveç', 275.00, 'Deniz Ürünleri'),
      ('Spagetti Bolonez', 155.00, 'Makarnalar'), ('Fettuccine Alfredo', 165.00, 'Makarnalar'),
      ('Margherita', 135.00, 'Pizzalar'), ('Pepperoni', 155.00, 'Pizzalar'),
      ('Baklava', 85.00, 'Tatlılar'), ('Künefe', 95.00, 'Tatlılar')
    ) AS p(name, price, category_name)
    WHERE t.slug = 'sefpos-demo' AND cat.name = p.category_name
    AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.tenant_id = t.id AND pr.name = p.name);
  ELSE
    INSERT INTO products (id, tenant_id, name, price, category_id)
    SELECT gen_random_uuid(), t.id, p.name, p.price, cat.id
    FROM tenants t
    JOIN categories cat ON cat.tenant_id = t.id
    CROSS JOIN (VALUES 
      ('Mercimek Çorbası', 45.00, 'Çorbalar'), ('Yayla Çorbası', 55.00, 'Çorbalar'),
      ('Çoban Salata', 75.00, 'Salatalar'), ('Sezar Salata', 95.00, 'Salatalar'),
      ('Humus', 65.00, 'Başlangıçlar'), ('Patates Kızartması', 55.00, 'Başlangıçlar'),
      ('Kuzu Pirzola', 285.00, 'Ana Yemekler'), ('Etli Sarmalı Sarma', 165.00, 'Ana Yemekler'),
      ('Adana Kebap', 225.00, 'Izgara'), ('Urfa Kebap', 215.00, 'Izgara'),
      ('Tavuk Şiş', 185.00, 'Tavuk'), ('Tavuk Döner', 175.00, 'Tavuk'),
      ('Levrek Izgara', 245.00, 'Deniz Ürünleri'), ('Karides Güveç', 275.00, 'Deniz Ürünleri'),
      ('Spagetti Bolonez', 155.00, 'Makarnalar'), ('Fettuccine Alfredo', 165.00, 'Makarnalar'),
      ('Margherita', 135.00, 'Pizzalar'), ('Pepperoni', 155.00, 'Pizzalar'),
      ('Baklava', 85.00, 'Tatlılar'), ('Künefe', 95.00, 'Tatlılar')
    ) AS p(name, price, category_name)
    WHERE t.slug = 'sefpos-demo' AND cat.name = p.category_name
    AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.tenant_id = t.id AND pr.name = p.name);
  END IF;
END $$;

-- Demo kullanıcı için şifre hash (2128948++ için)
-- Bu hash değerini Supabase auth.users tablosunda manuel olarak güncellemeniz gerekebilir
-- Çünkü auth.users tablosu Supabase tarafından yönetilir

DO $notice$ BEGIN
  RAISE NOTICE 'Demo veriler başarıyla oluşturuldu!';
  RAISE NOTICE 'Kullanıcı: info@sefpos.com.tr';
  RAISE NOTICE 'Şifre: 2128948++';
  RAISE NOTICE 'Toplam 20 masa (10 Salon + 10 Bahçe)';
  RAISE NOTICE '10 kategori ve 20 ürün eklendi.';
END $notice$;
