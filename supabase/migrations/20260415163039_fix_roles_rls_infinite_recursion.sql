/*
  # Roles Tablosu RLS Sonsuz Döngü Düzeltmesi

  ## Sorun
  Mevcut UPDATE/INSERT/DELETE politikaları roles tablosunu kendi içinde JOIN yapıyordu:
  `JOIN roles r ON (p.role_id = r.id)` → sonsuz özyineleme hatası

  ## Çözüm
  roles tablosuna join yapmak yerine profiles.role (text) alanını kullanarak
  owner/admin kontrolü yapıyoruz. Bu şekilde döngü oluşmuyor.
*/

DROP POLICY IF EXISTS "Admins can delete roles" ON roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON roles;
DROP POLICY IF EXISTS "Admins can update roles" ON roles;

CREATE POLICY "Owners and admins can update roles"
  ON roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = roles.tenant_id
        AND p.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = roles.tenant_id
        AND p.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can insert roles"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = roles.tenant_id
        AND p.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can delete roles"
  ON roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = roles.tenant_id
        AND p.role IN ('owner', 'admin')
    )
  );
