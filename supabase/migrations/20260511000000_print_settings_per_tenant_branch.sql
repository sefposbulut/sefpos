/*
  # Tenant + Şube Bazlı Yazıcı Ayarları (Bulut Senkronu)

  ## Açıklama
  ŞefPOS yazıcı/grup ayarları (`PrintSettings`) artık tek kaynaktan,
  Supabase'den okunup yazılır. Böylece Electron kasada yapılan kategori →
  yazıcı eşlemesi, fiş başlığı, default yazıcı vs. ayarları web ve mobil
  tarafında da otomatik görünür; her cihazda ayrı ayrı yapılandırma
  ihtiyacı ortadan kalkar.

  ## Tablo
  - `print_settings`
    - `id` UUID
    - `tenant_id` UUID — hangi tenant'a ait
    - `branch_id` UUID NULL — hangi şube (NULL = tenant geneli fallback)
    - `settings` JSONB — istemcideki `PrintSettings` yapısı bire bir
    - `updated_at` timestamptz
    - `updated_by` UUID NULL — son güncelleyen kullanıcı

  Birden fazla şubesi olan restoranlar için her şubenin kendi ayarları
  olabilir. `printer_registrations` tablosundakiyle aynı stilde,
  `(tenant_id, COALESCE(branch_id, '00000000...'))` partial unique index
  kullanılır (PostgreSQL NULL'ları unique kabul eder, COALESCE ile
  workaround).

  ## RLS
  Yalnızca aynı tenant'a ait kullanıcılar okuyup yazabilir.
*/

CREATE TABLE IF NOT EXISTS print_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_settings_tenant_branch_unique
  ON print_settings(tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_print_settings_tenant ON print_settings(tenant_id);

ALTER TABLE print_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view print settings" ON print_settings;
CREATE POLICY "Tenant members can view print settings"
  ON print_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members can insert print settings" ON print_settings;
CREATE POLICY "Tenant members can insert print settings"
  ON print_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members can update print settings" ON print_settings;
CREATE POLICY "Tenant members can update print settings"
  ON print_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members can delete print settings" ON print_settings;
CREATE POLICY "Tenant members can delete print settings"
  ON print_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

-- updated_at otomatik tazelensin.
CREATE OR REPLACE FUNCTION set_print_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_print_settings_updated_at ON print_settings;
CREATE TRIGGER trg_print_settings_updated_at
  BEFORE UPDATE ON print_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_print_settings_updated_at();
