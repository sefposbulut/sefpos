/*
  # Printer Registrations Tablosu

  ## Açıklama
  Electron masaüstü uygulaması yazıcı listesini bu tabloya yazar.
  Web uygulaması bu tabloyu okuyarak mevcut yazıcıları keşfeder.
  HTTPS mixed-content sorunu olmadan yazıcı listesi alınabilir.

  ## Tablolar
  - `printer_registrations`: Electron tarafından yayınlanan yazıcı listesi
    - id: UUID primary key
    - tenant_id: Hangi tenant'a ait
    - branch_id: Hangi şubede kayıtlı (opsiyonel)
    - printers: JSON dizisi - yazıcı adları ve özellikleri
    - last_seen_at: Son güncelleme zamanı (Electron ne zaman online oldu)
    - created_at: İlk kayıt zamanı

  ## Güvenlik
  - RLS aktif
  - Aynı tenant'taki kullanıcılar okuyabilir
  - Sadece Electron service_role ile yazabilir (anon key ile de yazılabilir, Electron'un token'ı olmadığı için)
*/

CREATE TABLE IF NOT EXISTS printer_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  printers jsonb NOT NULL DEFAULT '[]',
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_printer_reg_tenant_branch
  ON printer_registrations(tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE printer_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view printer registrations"
  ON printer_registrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = printer_registrations.tenant_id
    )
  );

CREATE POLICY "Tenant members can insert printer registrations"
  ON printer_registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = printer_registrations.tenant_id
    )
  );

CREATE POLICY "Tenant members can update printer registrations"
  ON printer_registrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = printer_registrations.tenant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = printer_registrations.tenant_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_printer_reg_tenant ON printer_registrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_printer_reg_last_seen ON printer_registrations(last_seen_at);
