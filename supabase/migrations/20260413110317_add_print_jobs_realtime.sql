/*
  # Print Jobs Tablosu

  ## Açıklama
  Web uygulamasının HTTPS Mixed Content sorunu olmadan yazıcıya iş gönderebilmesi için
  Supabase Realtime kanalı üzerinden çalışan bir print job kuyruğu sistemi.

  Web tarafı → print_jobs tablosuna kayıt ekler
  Electron uygulaması → Realtime ile INSERT'i dinler, yazdırır, durumu günceller

  ## Tablolar
  - `print_jobs`: Yazdırma işleri kuyruğu
    - id: UUID primary key
    - branch_id: Hangi şubeye ait
    - html: Yazdırılacak HTML içerik
    - printer_name: Hedef yazıcı adı
    - status: pending / processing / done / failed
    - error: Hata mesajı (varsa)
    - created_at: Oluşturulma zamanı
    - updated_at: Güncellenme zamanı

  ## Güvenlik
  - RLS aktif
  - authenticated kullanıcılar kendi branch'lerine ait kayıtları okuyabilir/ekleyebilir
  - Electron service_role key ile tüm kayıtlara erişir (policy dışı)
*/

CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  html text NOT NULL,
  printer_name text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can insert print jobs"
  ON print_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.branch_id = print_jobs.branch_id
    )
  );

CREATE POLICY "Branch members can view print jobs"
  ON print_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.branch_id = print_jobs.branch_id
    )
  );

CREATE POLICY "Branch members can update print jobs"
  ON print_jobs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.branch_id = print_jobs.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.branch_id = print_jobs.branch_id
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE print_jobs;

CREATE INDEX IF NOT EXISTS idx_print_jobs_branch_status ON print_jobs(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON print_jobs(created_at);
