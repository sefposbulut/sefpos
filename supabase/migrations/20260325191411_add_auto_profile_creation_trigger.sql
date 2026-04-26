/*
  # Auto-create profile and tenant on user signup

  1. Changes
    - Creates a trigger function that automatically creates a tenant and profile when a new user signs up
    - Handles the entire signup flow in a single transaction
    - Extracts tenant name and user name from user metadata

  2. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only triggers on new user creation in auth.users
*/

-- Function to auto-create tenant and profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name_val text;
  user_full_name text;
  user_role text;
BEGIN
  -- Extract metadata from the new user
  tenant_name_val := COALESCE(NEW.raw_user_meta_data->>'tenant_name', 'My Restaurant');
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'owner');

  -- Create tenant first
  INSERT INTO public.tenants (name, slug, email)
  VALUES (
    tenant_name_val,
    lower(regexp_replace(tenant_name_val, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(random()::text), 1, 6),
    NEW.email
  )
  RETURNING id INTO new_tenant_id;

  -- Create profile linked to tenant
  INSERT INTO public.profiles (id, tenant_id, email, full_name, role)
  VALUES (
    NEW.id,
    new_tenant_id,
    NEW.email,
    user_full_name,
    user_role::user_role
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();