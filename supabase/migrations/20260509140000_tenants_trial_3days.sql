/*
  # tenants — 3 gunluk deneme + trial/expired status

  ## Amac
  Yeni kayit olan restoran 3 gun ucretsiz deneme alir.
  - subscription_status: 'trial' / 'active' / 'suspended' / 'cancelled' / 'expired'
  - subscription_plan:   'trial' / 'basic' / 'pro' / ... (serbest metin)
  - subscription_expires_at: trial bitis tarihi (now() + 3 days)

  ## Degisiklikler
  1. tenants.subscription_status CHECK constraint genisletildi
     ('trial' ve 'expired' eklendi)
  2. handle_new_user trigger fonksiyonu — yeni tenant icin:
     - subscription_status = 'trial'
     - subscription_plan   = 'trial'
     - subscription_expires_at = now() + interval '3 days'

  ## Geri uyumluluk
  - Mevcut tenant'lar etkilenmez
  - 14 gunluk kayitlar zaten 'active' status ile devam eder
*/

-- 1) Constraint'i yenile
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.tenants'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%subscription_status%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tenants DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled', 'expired'));

-- 2) handle_new_user — 3 gun trial + status='trial'
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

  -- Telefonu normalize et
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
      user_phone := NULL;
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

  INSERT INTO public.tenants (
    name, slug, email,
    subscription_plan, subscription_expires_at, subscription_status,
    onboarding_completed
  )
  VALUES (
    tenant_name_val,
    lower(regexp_replace(tenant_name_val, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(random()::text), 1, 6),
    NEW.email,
    'trial',
    now() + interval '3 days',
    'trial',
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
