/*
  # handle_new_user Trigger Düzeltmesi

  ## Sorun
  Admin tarafından create-user edge function ile oluşturulan kullanıcılar için
  trigger her zaman yeni bir tenant oluşturuyordu. Bu yanlış.

  ## Çözüm
  Trigger artık metadata'da `tenant_id` varsa yeni tenant oluşturmaz,
  sadece profile oluşturur. `tenant_id` yoksa (yani normal kayıt akışı)
  yeni tenant ve ana şube oluşturur.

  ## Değişiklikler
  - handle_new_user fonksiyonu güncellendi
  - Sub-user (şube kullanıcısı) akışı: metadata'dan tenant_id, branch_id, full_name alır
  - Owner akışı: yeni tenant + ana şube + owner profil oluşturur
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
  new_branch_id uuid;
  tenant_name_val text;
  user_full_name text;
  user_role text;
  existing_tenant_id uuid;
  existing_branch_id uuid;
BEGIN
  -- Metadata'dan değerleri oku
  existing_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  existing_branch_id := (NEW.raw_user_meta_data->>'branch_id')::uuid;
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Eğer tenant_id metadata'da varsa -> admin tarafından oluşturulmuş sub-user
  IF existing_tenant_id IS NOT NULL THEN
    -- Sadece profil oluştur, tenant oluşturma
    INSERT INTO public.profiles (id, tenant_id, branch_id, email, full_name, role)
    VALUES (
      NEW.id,
      existing_tenant_id,
      existing_branch_id,
      NEW.email,
      user_full_name,
      'waiter'  -- default, role_id ile override edilecek
    )
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      branch_id = EXCLUDED.branch_id,
      full_name = EXCLUDED.full_name;
    
    RETURN NEW;
  END IF;

  -- Normal kayıt akışı: yeni tenant + ana şube + owner profil
  tenant_name_val := COALESCE(NEW.raw_user_meta_data->>'tenant_name', 'Restoranım');
  user_role := 'owner';

  -- Tenant oluştur
  INSERT INTO public.tenants (name, slug, email)
  VALUES (
    tenant_name_val,
    lower(regexp_replace(tenant_name_val, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(random()::text), 1, 6),
    NEW.email
  )
  RETURNING id INTO new_tenant_id;

  -- Ana şube oluştur
  INSERT INTO public.branches (tenant_id, name, is_main, is_active)
  VALUES (new_tenant_id, 'Ana Şube', true, true)
  RETURNING id INTO new_branch_id;

  -- Owner profili oluştur
  INSERT INTO public.profiles (id, tenant_id, branch_id, email, full_name, role)
  VALUES (
    NEW.id,
    new_tenant_id,
    new_branch_id,
    NEW.email,
    user_full_name,
    'owner'
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    branch_id = EXCLUDED.branch_id,
    full_name = EXCLUDED.full_name;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
