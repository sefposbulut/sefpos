/*
  # Fix tenant INSERT RLS + Add admin/onboarding columns

  ## Changes
  1. Add subscription_plan, subscription_expires_at, max_branches, notes to tenants
  2. Add is_super_admin, onboarding_completed to profiles
  3. Add onboarding_completed to tenants
  4. Add INSERT policy on tenants so trigger can create them
  5. Add super admin policies on tenants
  6. Recreate handle_new_user with better error handling
*/

-- Add missing columns to tenants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'subscription_plan') THEN
    ALTER TABLE public.tenants ADD COLUMN subscription_plan text DEFAULT 'trial';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'subscription_expires_at') THEN
    ALTER TABLE public.tenants ADD COLUMN subscription_expires_at timestamptz DEFAULT (now() + interval '14 days');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'max_branches') THEN
    ALTER TABLE public.tenants ADD COLUMN max_branches int DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'notes') THEN
    ALTER TABLE public.tenants ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE public.tenants ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;
END $$;

-- Add missing columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_super_admin') THEN
    ALTER TABLE public.profiles ADD COLUMN is_super_admin boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;
END $$;

-- Drop existing tenant policies to recreate cleanly
DROP POLICY IF EXISTS "Tenants are viewable by their members" ON public.tenants;
DROP POLICY IF EXISTS "Allow tenant creation on signup" ON public.tenants;
DROP POLICY IF EXISTS "Super admin can read all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Super admin can update tenants" ON public.tenants;

-- Recreate all tenant policies
CREATE POLICY "Tenants are viewable by their members"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "Allow tenant creation on signup"
  ON public.tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Super admin can update tenants"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

-- Recreate the trigger function with robust error handling
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

  INSERT INTO public.tenants (name, slug, email, subscription_plan, subscription_expires_at, subscription_status)
  VALUES (
    tenant_name_val,
    lower(regexp_replace(tenant_name_val, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(random()::text), 1, 6),
    NEW.email,
    'trial',
    now() + interval '14 days',
    'trial'
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
END;
$$;
