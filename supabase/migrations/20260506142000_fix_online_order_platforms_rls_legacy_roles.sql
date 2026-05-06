/*
  # Fix online_order_platforms RLS for legacy role model

  Some accounts use profiles.role (owner/admin/manager) with role_id = null.
  Existing policy only checks roles table via role_id and blocks INSERT/UPDATE.
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
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND (
          COALESCE(r.permissions->>'can_manage_settings', 'false') = 'true'
          OR p.role IN ('owner', 'admin', 'manager')
        )
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id
      FROM profiles p
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND (
          COALESCE(r.permissions->>'can_manage_settings', 'false') = 'true'
          OR p.role IN ('owner', 'admin', 'manager')
        )
    )
  );
