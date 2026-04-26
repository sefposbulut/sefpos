/*
  # Fix Profile Delete Cascade

  Add ON DELETE CASCADE to profiles table so deleting a profile also deletes the auth user.
  This ensures complete user removal from the system.
*/

-- Drop existing foreign key if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
