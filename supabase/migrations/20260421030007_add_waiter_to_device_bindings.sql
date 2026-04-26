/*
  # Add Waiter to Device Bindings

  1. Changes
    - Add waiter_id column to device_bindings
    - Each device binding is now specific to a waiter
    - Multiple waiters can bind multiple devices
    - One waiter can have multiple devices bound

  2. Relationships
    - device_bindings → waiters (one waiter can have many device bindings)
    - Each binding is unique per (waiter, device_code)

  3. Security
    - Waiters can only see their own bindings
    - Managers can manage their tenant's waiter bindings
*/

ALTER TABLE device_bindings
ADD COLUMN IF NOT EXISTS waiter_id uuid REFERENCES waiters(id) ON DELETE CASCADE;

-- Add unique constraint for waiter + device combo
ALTER TABLE device_bindings
DROP CONSTRAINT IF EXISTS device_bindings_device_id_tenant_id_key;

ALTER TABLE device_bindings
ADD CONSTRAINT unique_waiter_device UNIQUE(waiter_id, device_id);

-- Update RLS to check waiter
DROP POLICY IF EXISTS "Managers can view their tenant's device bindings" ON device_bindings;
DROP POLICY IF EXISTS "Managers can manage device bindings" ON device_bindings;

CREATE POLICY "Managers can view tenant device bindings"
  ON device_bindings FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  );

CREATE POLICY "Managers can manage tenant device bindings"
  ON device_bindings FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  );

CREATE INDEX idx_device_bindings_waiter ON device_bindings(waiter_id);
