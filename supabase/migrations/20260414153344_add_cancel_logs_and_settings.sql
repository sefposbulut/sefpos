/*
  # İptal Log Sistemi ve Ayarlar

  1. Yeni Tablolar
    - `order_cancel_logs`
      - `id` (uuid, pk)
      - `tenant_id` (uuid)
      - `branch_id` (uuid, nullable)
      - `order_id` (uuid, nullable) - hangi sipariş
      - `order_item_id` (uuid, nullable) - hangi kalem iptal edildi
      - `product_name` (text) - iptal anındaki ürün adı snapshot
      - `quantity` (int) - iptal edilen miktar
      - `unit_price` (numeric)
      - `cancel_reason` (text, nullable) - garson tarafından girilen açıklama
      - `cancelled_by` (uuid) - kim iptal etti
      - `cancelled_by_name` (text) - garson adı snapshot
      - `created_at` (timestamptz)

  2. Tenants tablosuna ayar kolonları
    - `require_cancel_reason` (boolean, default false) - iptal açıklaması zorunlu mu

  3. Orders tablosuna waiter_name kolonu
    - `waiter_name` (text, nullable) - sipariş alan garson adı snapshot

  4. RLS: cancel_logs tenant izolasyonu
*/

-- orders tablosuna waiter_name ekle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'waiter_name'
  ) THEN
    ALTER TABLE orders ADD COLUMN waiter_name text;
  END IF;
END $$;

-- tenants tablosuna require_cancel_reason ayarı ekle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'require_cancel_reason'
  ) THEN
    ALTER TABLE tenants ADD COLUMN require_cancel_reason boolean DEFAULT false;
  END IF;
END $$;

-- İptal log tablosu
CREATE TABLE IF NOT EXISTS order_cancel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id uuid,
  order_number text,
  product_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  cancel_reason text,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_cancel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view cancel logs"
  ON order_cancel_logs FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert cancel logs"
  ON order_cancel_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_cancel_logs_tenant_id ON order_cancel_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cancel_logs_created_at ON order_cancel_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cancel_logs_order_id ON order_cancel_logs(order_id);
