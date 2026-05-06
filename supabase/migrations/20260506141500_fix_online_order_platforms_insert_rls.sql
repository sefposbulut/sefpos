/*
  # Fix RLS for online_order_platforms INSERT

  Existing policy "Admins can manage platforms" was created FOR ALL with only USING,
  but INSERT requires WITH CHECK. This caused:
  "new row violates row-level security policy for table online_order_platforms"
*/

DROP POLICY IF EXISTS "Admins can manage platforms" ON online_order_platforms;

CREATE POLICY "Admins can manage platforms"
  ON online_order_platforms
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT p.tenant_id
      FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND r.permissions->>'can_manage_settings' = 'true'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id
      FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND r.permissions->>'can_manage_settings' = 'true'
    )
  );
