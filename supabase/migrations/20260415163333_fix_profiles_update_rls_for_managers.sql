/*
  # Profiles UPDATE RLS Düzeltmesi - Yönetici Güncelleme Yetkisi

  ## Sorun
  profiles tablosundaki UPDATE politikası yalnızca kullanıcının kendi profilini
  güncellemesine izin veriyordu. Owner/admin/manager rolündeki kullanıcılar
  diğer kullanıcıların rol ve şube bilgilerini değiştiremiyordu.

  ## Çözüm
  Owner, admin ve manager rollerine aynı tenant içindeki diğer kullanıcıları
  güncelleyebilme yetkisi eklendi.
*/

CREATE POLICY "Owner admin manager can update tenant profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id_direct()
    AND get_my_role_direct() = ANY (ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id_direct()
    AND get_my_role_direct() = ANY (ARRAY['owner', 'admin', 'manager'])
  );
