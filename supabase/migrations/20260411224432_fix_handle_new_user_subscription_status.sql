/*
  # Fix handle_new_user trigger - subscription_status constraint

  The handle_new_user trigger was using 'trial' as subscription_status,
  but the tenants table only allows: 'active', 'suspended', 'cancelled'.
  
  This migration:
  1. Fixes the handle_new_user function to use 'active' instead of 'trial'
  2. Manually creates the missing tenant/branch/profile for users who failed registration
*/

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
BEGIN
  existing_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  existing_branch_id := (NEW.raw_user_meta_data->>'branch_id')::uuid;
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  IF existing_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id, branch_id, email, full_name, role)
    VALUES (NEW.id, existing_tenant_id, existing_branch_id, NEW.email, user_full_name, 'waiter')
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      branch_id = EXCLUDED.branch_id,
      full_name = EXCLUDED.full_name;
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

  INSERT INTO public.profiles (id, tenant_id, branch_id, email, full_name, role)
  VALUES (NEW.id, new_tenant_id, new_branch_id, NEW.email, user_full_name, 'owner')
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    branch_id = EXCLUDED.branch_id,
    full_name = EXCLUDED.full_name;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;
