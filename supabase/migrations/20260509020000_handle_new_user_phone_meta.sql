-- handle_new_user: kayit sirasinda raw_user_meta_data->>'phone' geliyorsa
-- profiles.phone alanina da yaz. Boylece telefon-tabanli login (resolve)
-- profiles.phone uzerinden gercek email'i bulur ve sentetik @sefpos.com.tr
-- domain'ine ihtiyac kalmaz (MX hatasini koklu cozer).
--
-- Geri uyumlu: phone yoksa eski davranis aynen calisir.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  new_branch_id uuid;
  tenant_name_val text;
  user_full_name text;
  existing_tenant_id uuid;
  existing_branch_id uuid;
  user_phone text;
  digits_only text;
BEGIN
  existing_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  existing_branch_id := (NEW.raw_user_meta_data->>'branch_id')::uuid;
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Telefonu normalize et: yalniz rakamlar, 11 hane '0...' formatina getir
  user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  IF user_phone IS NOT NULL THEN
    digits_only := regexp_replace(user_phone, '\D', '', 'g');
    IF length(digits_only) = 12 AND left(digits_only, 2) = '90' THEN
      digits_only := substr(digits_only, 3);
    END IF;
    IF length(digits_only) = 10 THEN
      digits_only := '0' || digits_only;
    END IF;
    IF length(digits_only) = 11 AND left(digits_only, 2) = '05' THEN
      user_phone := digits_only;
    ELSE
      user_phone := NULL; -- gecersizse yazma
    END IF;
  END IF;

  IF existing_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id, branch_id, email, full_name, role, phone)
    VALUES (NEW.id, existing_tenant_id, existing_branch_id, NEW.email, user_full_name, 'waiter', user_phone)
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      branch_id = EXCLUDED.branch_id,
      full_name = EXCLUDED.full_name,
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone);
    RETURN NEW;
  END IF;

  tenant_name_val := COALESCE(NEW.raw_user_meta_data->>'tenant_name', 'Restoranım');

  INSERT INTO public.tenants (name, slug, email, subscription_plan, subscription_expires_at, subscription_status, onboarding_completed)
  VALUES (
    tenant_name_val,
    lower(regexp_replace(tenant_name_val, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(random()::text), 1, 6),
    NEW.email,
    'trial',
    now() + interval '14 days',
    'active',
    false
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.branches (tenant_id, name, is_main, is_active)
  VALUES (new_tenant_id, 'Ana Şube', true, true)
  RETURNING id INTO new_branch_id;

  INSERT INTO public.profiles (id, tenant_id, branch_id, email, full_name, role, phone)
  VALUES (NEW.id, new_tenant_id, new_branch_id, NEW.email, user_full_name, 'owner', user_phone)
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    branch_id = EXCLUDED.branch_id,
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
