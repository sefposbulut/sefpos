/*
  # Bayi (Reseller) ve Lisans Sistemi

  ## Yeni Tablolar

  ### resellers
  - Bayi kayıtları (bayiler sisteme üye olabilir)
  - id, email, company_name, contact_name, phone, status (pending/active/suspended)
  - commission_rate: Bayi komisyon oranı
  - created_at

  ### licenses
  - Her müşteri (tenant) için lisans kaydı
  - tenant_id -> tenants tablosuna referans
  - reseller_id -> resellers tablosuna referans (bayiden geliyorsa)
  - license_key: Benzersiz lisans anahtarı
  - plan: (trial/starter/pro/enterprise)
  - status: (active/expired/suspended)
  - expires_at: Lisans bitiş tarihi
  - max_branches: İzin verilen şube sayısı
  - max_users: İzin verilen kullanıcı sayısı
  - notes: Admin notları

  ## Güvenlik
  - RLS etkin
  - Super admin tüm kayıtları görebilir
  - Bayiler kendi müşterilerini görebilir
  - Tenant'lar kendi lisanslarını görebilir
*/

CREATE TABLE IF NOT EXISTS resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage resellers"
  ON resellers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Super admins can insert resellers"
  ON resellers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update resellers"
  ON resellers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  reseller_id uuid REFERENCES resellers(id) ON DELETE SET NULL,
  license_key text UNIQUE NOT NULL DEFAULT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended')),
  expires_at timestamptz,
  max_branches integer NOT NULL DEFAULT 1,
  max_users integer NOT NULL DEFAULT 5,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all licenses"
  ON licenses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Tenants can view own license"
  ON licenses FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Super admins can insert licenses"
  ON licenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update licenses"
  ON licenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE TABLE IF NOT EXISTS reseller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reseller_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit reseller application"
  ON reseller_applications FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Super admins can view reseller applications"
  ON reseller_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update reseller applications"
  ON reseller_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_licenses_tenant_id ON licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_licenses_reseller_id ON licenses(reseller_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_resellers_status ON resellers(status);
CREATE INDEX IF NOT EXISTS idx_reseller_applications_status ON reseller_applications(status);
