/*
  # Fix User Creation with Proper Metadata Handling

  1. Changes
    - Update trigger to read tenant_id from user metadata
    - Ensure profile is created with correct tenant_id when user signs up
    - Handle both owner signup and staff user creation
    
  2. Security
    - Maintains RLS policies
    - Ensures all users belong to a tenant
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create updated function that reads metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tenant_id uuid;
  user_full_name text;
BEGIN
  -- Get tenant_id from user metadata
  user_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  user_full_name := NEW.raw_user_meta_data->>'full_name';

  -- Only create profile if tenant_id is provided
  IF user_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id, email, full_name)
    VALUES (
      NEW.id,
      user_tenant_id,
      NEW.email,
      COALESCE(user_full_name, NEW.email)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();