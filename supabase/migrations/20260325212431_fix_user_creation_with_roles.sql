/*
  # Fix User Creation with Role Assignment

  1. Changes
    - Update auto profile creation trigger to handle role assignment
    - Ensure new users get proper default role
    
  2. Security
    - Maintain RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_tenant_id uuid;
  default_role_id uuid;
BEGIN
  -- Get tenant_id from user metadata
  user_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  
  -- If tenant_id is provided in metadata, use it
  IF user_tenant_id IS NOT NULL THEN
    -- Get the first admin role for this tenant as default
    SELECT id INTO default_role_id
    FROM roles
    WHERE tenant_id = user_tenant_id
    AND name = 'Yönetici'
    LIMIT 1;
    
    -- Insert profile with role
    INSERT INTO public.profiles (id, tenant_id, email, full_name, role, role_id)
    VALUES (
      new.id,
      user_tenant_id,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', new.email),
      'admin',
      default_role_id
    );
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();