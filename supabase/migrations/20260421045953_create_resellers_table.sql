/*
  # Create Resellers Table

  1. New Tables
    - `resellers`
      - `id` (uuid, primary key)
      - `company_name` (text)
      - `contact_name` (text)
      - `phone` (text)
      - `email` (text)
      - `city` (text)
      - `status` (text: pending, approved, rejected)
      - `license_count` (integer, default 0)
      - `created_at` (timestamp)

  2. Security
    - Public insert (anyone can submit form)
    - Admin read-only access
*/

CREATE TABLE IF NOT EXISTS resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  city text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  license_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE resellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit reseller form"
  ON resellers
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Admin can view all resellers"
  ON resellers
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );
