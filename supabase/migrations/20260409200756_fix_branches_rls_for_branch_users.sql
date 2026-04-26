/*
  # Branches RLS: Şube Kullanıcıları Sadece Kendi Şubesini Görür

  ## Sorun
  Şube üyelerine ait SELECT politikası tüm tenant şubelerini gösteriyordu.
  Şube kullanıcıları diğer şubeleri görememelidir.

  ## Çözüm
  - Owner/admin: tenant'a ait tüm şubeleri görür
  - Diğer kullanıcılar: sadece profile.branch_id ile eşleşen şubeyi görür
*/

DROP POLICY IF EXISTS "Şube üyeleri kendi şubelerini görebilir" ON branches;

CREATE POLICY "Şube üyeleri kendi şubelerini görebilir"
  ON branches FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR id = get_my_branch_id()
    )
  );
