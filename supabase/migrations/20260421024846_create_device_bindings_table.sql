/*
  # Create Device Bindings Table for Waiters

  1. New Tables
    - `device_bindings`
      - `id` (uuid, primary key)
      - `device_id` (text, unique device identifier)
      - `tenant_id` (uuid, foreign key to tenants)
      - `status` (enum: active, inactive)
      - `registered_at` (timestamp)

  2. Security
    - Enable RLS on `device_bindings` table
    - Add policy for managers to view their tenant's bindings
    - Add policy for managers to manage bindings

  3. Relationships
    - Device bindings belong to a tenant
    - Each device can only be bound to one tenant
*/

CREATE TABLE IF NOT EXISTS device_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  registered_at timestamptz DEFAULT now(),
  UNIQUE(device_id, tenant_id)
);

ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view their tenant's device bindings"
  ON device_bindings FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
    )
  );

CREATE POLICY "Managers can manage device bindings"
  ON device_bindings FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
    )
  );

CREATE INDEX idx_device_bindings_tenant ON device_bindings(tenant_id);
CREATE INDEX idx_device_bindings_device ON device_bindings(device_id);
CREATE INDEX idx_device_bindings_status ON device_bindings(status);
