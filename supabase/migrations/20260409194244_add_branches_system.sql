/*
  # Şube (Branch) Sistemi Eklendi

  ## Özet
  Her restoran sahibinin birden fazla şube açabilmesi için şube yönetim sistemi eklendi.

  ## Yeni Tablolar
  - `branches` - Restoran şubeleri
    - `id` (uuid, primary key)
    - `tenant_id` (uuid, tenants tablosuna foreign key)
    - `name` (text) - Şube adı (örn: "Merkez Şube", "Kadıköy Şubesi")
    - `address` (text) - Şube adresi
    - `phone` (text) - Şube telefonu
    - `is_active` (boolean) - Şube aktif mi
    - `is_main` (boolean) - Ana şube mi
    - `created_at` (timestamptz)

  ## Değiştirilen Tablolar
  - `profiles` - Kullanıcılara `branch_id` sütunu eklendi (hangi şubede çalıştığı)
  - `restaurant_tables` - Masalara `branch_id` sütunu eklendi
  - `orders` - Siparişlere `branch_id` sütunu eklendi

  ## Güvenlik
  - Tüm tablolarda RLS aktif
  - Sadece kendi tenant'ındaki şubeleri görebilir/yönetebilir
  - Şube oluşturma/silme sadece owner/admin rollerine açık

  ## Önemli Notlar
  - Mevcut veriler bozulmaz, branch_id nullable olarak eklendi
  - Her tenant için otomatik "Ana Şube" oluşturulur
*/

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  address text DEFAULT '',
  phone text DEFAULT '',
  is_active boolean DEFAULT true,
  is_main boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Şube üyeleri kendi şubelerini görebilir"
  ON branches FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Owner ve admin şube oluşturabilir"
  ON branches FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner ve admin şube güncelleyebilir"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner şube silebilir"
  ON branches FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO branches (tenant_id, name, is_main, is_active)
SELECT id, 'Ana Şube', true, true
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM branches WHERE is_main = true)
ON CONFLICT (tenant_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch_id ON restaurant_tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
