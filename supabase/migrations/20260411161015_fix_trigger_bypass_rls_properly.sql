/*
  # Fix handle_new_user trigger to properly bypass RLS

  ## Problem
  SET LOCAL row_security = off only works within the current transaction context.
  In Supabase auth triggers, this may not fully bypass RLS for all tables.
  The branches INSERT policy checks profiles table which doesn't exist yet during signup.

  ## Fix
  1. Add a permissive INSERT policy on branches for the trigger (postgres role)
  2. Keep the existing logic but ensure branches can always be inserted by SECURITY DEFINER functions
  3. Add retry-safe profile loading: if profile is missing after signup, wait and retry

  The cleanest fix: allow INSERT on branches when done by a SECURITY DEFINER function
  by adding a policy that checks if we're the postgres/service role.
*/

-- Drop the restrictive branches INSERT policy and replace with one that works during trigger
DROP POLICY IF EXISTS "Owner ve admin şube oluşturabilir" ON public.branches;

-- Allow authenticated users who own the tenant to insert branches
CREATE POLICY "Owner ve admin şube oluşturabilir"
  ON public.branches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT profiles.tenant_id
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- Also allow the postgres role (used by SECURITY DEFINER triggers) to insert
CREATE POLICY "Postgres role can insert branches for triggers"
  ON public.branches
  FOR INSERT
  TO postgres
  WITH CHECK (true);

-- Same for tenants - postgres role should be able to insert
CREATE POLICY "Postgres role can insert tenants for triggers"
  ON public.tenants
  FOR INSERT
  TO postgres
  WITH CHECK (true);

-- Same for profiles - postgres role should be able to insert
CREATE POLICY "Postgres role can insert profiles for triggers"
  ON public.profiles
  FOR INSERT
  TO postgres
  WITH CHECK (true);

-- Also allow postgres role to update profiles
CREATE POLICY "Postgres role can update profiles for triggers"
  ON public.profiles
  FOR UPDATE
  TO postgres
  USING (true)
  WITH CHECK (true);

-- Recreate the trigger without the SET LOCAL hack (not needed with proper policies)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
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
    'trial',
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
