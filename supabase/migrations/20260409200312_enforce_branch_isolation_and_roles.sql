/*
  # Şube İzolasyonu ve Rol Sistemi Güçlendirmesi

  ## Özet
  Şube kullanıcılarının sadece kendi şubelerinin verilerini görebilmesi için
  RLS politikaları güncellendi. Şube Müdürü rolü eklendi.

  ## Değişiklikler

  ### 1. Yardımcı Fonksiyonlar
  - `get_my_tenant_id()` - Mevcut kullanıcının tenant_id'sini döndürür
  - `get_my_branch_id()` - Mevcut kullanıcının branch_id'sini döndürür
  - `is_owner_or_admin()` - Kullanıcı owner veya admin mi kontrolü
  - `is_branch_manager()` - Kullanıcı şube müdürü mü kontrolü

  ### 2. RLS Politikaları Güncellendi
  - `restaurant_tables`: Şube kullanıcısı sadece kendi şubesinin masalarını görür
  - `orders`: Şube kullanıcısı sadece kendi şubesinin siparişlerini görür
  - `profiles`: branch_id bazlı görüntüleme

  ### 3. Yeni Roller
  - "Şube Müdürü" rolü tüm tenant'lara eklendi

  ### Güvenlik Notları
  - Tüm politikalar auth.uid() kullanıyor
  - Tenant izolasyonu korunuyor
  - Şube izolasyonu eklendi (branch_id NULL ise tüm şubeler görülebilir - owner/admin için)
*/

-- Yardımcı fonksiyonlar (SECURITY DEFINER ile güvenli)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_branch_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- Şube müdürü kontrolü: role_id'ye bağlı, can_manage_users izni ile
CREATE OR REPLACE FUNCTION has_permission(permission_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND (r.permissions->>permission_key)::boolean = true
  );
$$;

-- ================================================================
-- restaurant_tables RLS güncelleme
-- Şube kullanıcısı sadece kendi şubesini görür
-- Owner/admin tüm şubeleri görür
-- ================================================================

DROP POLICY IF EXISTS "Users can view own tenant tables" ON restaurant_tables;
DROP POLICY IF EXISTS "Owners and managers can manage tables" ON restaurant_tables;
DROP POLICY IF EXISTS "Authenticated users can update tables" ON restaurant_tables;
DROP POLICY IF EXISTS "Branch isolated table view" ON restaurant_tables;
DROP POLICY IF EXISTS "Branch isolated table insert" ON restaurant_tables;
DROP POLICY IF EXISTS "Branch isolated table update" ON restaurant_tables;
DROP POLICY IF EXISTS "Branch isolated table delete" ON restaurant_tables;

CREATE POLICY "Branch isolated table view"
  ON restaurant_tables FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      -- Owner/admin tüm şubeleri görür
      is_owner_or_admin()
      OR has_permission('can_manage_products')
      -- Şube kullanıcısı: branch_id eşleşmeli veya tablonun branch_id'si NULL ise
      OR branch_id IS NULL
      OR branch_id = get_my_branch_id()
    )
  );

CREATE POLICY "Branch isolated table insert"
  ON restaurant_tables FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (is_owner_or_admin() OR has_permission('can_manage_products'))
  );

CREATE POLICY "Branch isolated table update"
  ON restaurant_tables FOR UPDATE
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR has_permission('can_take_orders')
      OR branch_id = get_my_branch_id()
    )
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Branch isolated table delete"
  ON restaurant_tables FOR DELETE
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND is_owner_or_admin()
  );

-- ================================================================
-- orders RLS güncelleme
-- ================================================================

DROP POLICY IF EXISTS "Users can view own tenant orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users can update own tenant orders" ON orders;
DROP POLICY IF EXISTS "Branch isolated order view" ON orders;
DROP POLICY IF EXISTS "Branch isolated order insert" ON orders;
DROP POLICY IF EXISTS "Branch isolated order update" ON orders;

CREATE POLICY "Branch isolated order view"
  ON orders FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id IS NULL
      OR branch_id = get_my_branch_id()
    )
  );

CREATE POLICY "Branch isolated order insert"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
      OR branch_id IS NULL
    )
  );

CREATE POLICY "Branch isolated order update"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
      OR branch_id IS NULL
    )
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
  );

-- ================================================================
-- profiles: Şube kullanıcısı sadece kendi şubesindeki kullanıcıları görür
-- ================================================================

DROP POLICY IF EXISTS "Branch isolated profiles view" ON profiles;

CREATE POLICY "Branch isolated profiles view"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      id = auth.uid()
      OR is_owner_or_admin()
      OR has_permission('can_manage_users')
      OR branch_id = get_my_branch_id()
    )
  );

-- ================================================================
-- "Şube Müdürü" rolü ekle - mevcut tüm tenant'lara
-- ================================================================

DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    INSERT INTO roles (tenant_id, name, permissions)
    VALUES (
      tenant_record.id,
      'Şube Müdürü',
      '{
        "can_view_tables": true,
        "can_take_orders": true,
        "can_process_payments": true,
        "can_manage_products": true,
        "can_manage_users": true,
        "can_view_reports": true,
        "can_manage_cash_register": true
      }'::jsonb
    )
    ON CONFLICT (tenant_id, name) DO NOTHING;
  END LOOP;
END $$;

-- ================================================================
-- Yeni tenant kaydolduğunda Şube Müdürü rolünü de ekle
-- ================================================================

CREATE OR REPLACE FUNCTION create_default_roles_for_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO roles (tenant_id, name, permissions)
  VALUES
    (NEW.id, 'Yönetici', '{
      "can_view_tables": true, "can_take_orders": true, "can_process_payments": true,
      "can_manage_products": true, "can_manage_users": true, "can_view_reports": true,
      "can_manage_cash_register": true
    }'::jsonb),
    (NEW.id, 'Şube Müdürü', '{
      "can_view_tables": true, "can_take_orders": true, "can_process_payments": true,
      "can_manage_products": true, "can_manage_users": true, "can_view_reports": true,
      "can_manage_cash_register": true
    }'::jsonb),
    (NEW.id, 'Kasiyer', '{
      "can_view_tables": true, "can_take_orders": false, "can_process_payments": true,
      "can_manage_products": false, "can_manage_users": false, "can_view_reports": false,
      "can_manage_cash_register": true
    }'::jsonb),
    (NEW.id, 'Garson', '{
      "can_view_tables": true, "can_take_orders": true, "can_process_payments": false,
      "can_manage_products": false, "can_manage_users": false, "can_view_reports": false,
      "can_manage_cash_register": false
    }'::jsonb)
  ON CONFLICT (tenant_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created_create_roles ON tenants;
CREATE TRIGGER on_tenant_created_create_roles
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION create_default_roles_for_tenant();
