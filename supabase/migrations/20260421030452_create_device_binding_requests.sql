/*
  # Device Binding Request System

  1. New Tables
    - `device_binding_requests`
      - `id` (uuid, primary key)
      - `code` (text, unique 6-char code)
      - `waiter_id` (uuid, references waiters)
      - `tenant_id` (uuid, references tenants)
      - `device_id` (text, device code from browser)
      - `status` (pending, accepted, rejected)
      - `created_at` (timestamp)
      - `expires_at` (timestamp, 15 min)
      - `accepted_at` (timestamp, when manager accepts)

  2. Security
    - Enable RLS
    - Managers can view/accept requests for their tenant
    - Requests auto-expire after 15 minutes
    - Each waiter can have max 1 active pending request

  3. Process
    - Garson "Bağlama İste"ye basıyor
    - System 6-digit kod üretiyor (A1B2C3)
    - QR kod gösteriyor
    - Manager "Kabul Et"e basıyor
    - device_bindings tablosuna kayıt oluşuyor
    - Garson otomatik giriş yapabiliyor
*/

CREATE TABLE IF NOT EXISTS device_binding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  waiter_id uuid NOT NULL REFERENCES waiters(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '15 minutes'),
  accepted_at timestamptz,
  device_info jsonb DEFAULT '{}'
);

ALTER TABLE device_binding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Waiters can create binding requests"
  ON device_binding_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    waiter_id IN (
      SELECT id FROM waiters WHERE id = auth.uid()
    )
  );

CREATE POLICY "Managers can view tenant requests"
  ON device_binding_requests FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  );

CREATE POLICY "Managers can accept requests"
  ON device_binding_requests FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  );

CREATE INDEX idx_binding_requests_waiter ON device_binding_requests(waiter_id);
CREATE INDEX idx_binding_requests_tenant ON device_binding_requests(tenant_id);
CREATE INDEX idx_binding_requests_status ON device_binding_requests(status);
CREATE INDEX idx_binding_requests_expires ON device_binding_requests(expires_at);
