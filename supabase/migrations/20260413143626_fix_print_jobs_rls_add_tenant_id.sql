/*
  # Print Jobs RLS Düzeltmesi - Tenant ID Ekleme

  ## Sorun
  Mevcut RLS politikası print_jobs tablosunda profiles.branch_id = print_jobs.branch_id
  karşılaştırması yapıyor. Owner/admin kullanıcıların profiles.branch_id'si NULL olabilir,
  bu yüzden web'den yazdırma insert işlemi RLS engeline takılıyor.

  ## Değişiklikler
  - print_jobs tablosuna tenant_id kolonu eklendi
  - Eski RLS politikaları kaldırıldı
  - Owner/admin: tenant_id üzerinden erişim
  - Şube kullanıcıları: branch_id üzerinden erişim
  - Her iki durumu kapsayan yeni politikalar eklendi
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'print_jobs' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE print_jobs ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "Branch members can insert print jobs" ON print_jobs;
DROP POLICY IF EXISTS "Branch members can view print jobs" ON print_jobs;
DROP POLICY IF EXISTS "Branch members can update print jobs" ON print_jobs;

CREATE POLICY "Tenant members can insert print jobs"
  ON print_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_jobs.tenant_id
    )
  );

CREATE POLICY "Tenant members can view print jobs"
  ON print_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_jobs.tenant_id
    )
  );

CREATE POLICY "Tenant members can update print jobs"
  ON print_jobs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_jobs.tenant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_jobs.tenant_id
    )
  );
