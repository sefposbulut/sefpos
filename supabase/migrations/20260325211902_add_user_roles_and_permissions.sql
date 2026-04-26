/*
  # Add User Roles and Permissions System

  1. New Tables
    - `roles`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, references tenants)
      - `name` (text) - Role name (e.g., "Admin", "Garson", "Kasiyer")
      - `permissions` (jsonb) - Permission flags
      - `created_at` (timestamp)
    
  2. Changes
    - Add `role_id` to `profiles` table
    - Create default roles for each tenant
    
  3. Permissions Structure
    - can_view_tables: boolean
    - can_take_orders: boolean
    - can_process_payments: boolean
    - can_manage_products: boolean
    - can_manage_users: boolean
    - can_view_reports: boolean
    - can_manage_cash_register: boolean
    
  4. Security
    - Enable RLS on roles table
    - Add policies for role management
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  permissions jsonb DEFAULT '{
    "can_view_tables": true,
    "can_take_orders": true,
    "can_process_payments": false,
    "can_manage_products": false,
    "can_manage_users": false,
    "can_view_reports": false,
    "can_manage_cash_register": false
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Add role_id to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role_id uuid REFERENCES roles(id);
  END IF;
END $$;

-- RLS Policies for roles
CREATE POLICY "Users can view roles in their tenant"
  ON roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = roles.tenant_id
    )
  );

CREATE POLICY "Admins can insert roles"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND p.tenant_id = roles.tenant_id
      AND (r.permissions->>'can_manage_users')::boolean = true
    )
  );

CREATE POLICY "Admins can update roles"
  ON roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND p.tenant_id = roles.tenant_id
      AND (r.permissions->>'can_manage_users')::boolean = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND p.tenant_id = roles.tenant_id
      AND (r.permissions->>'can_manage_users')::boolean = true
    )
  );

CREATE POLICY "Admins can delete roles"
  ON roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND p.tenant_id = roles.tenant_id
      AND (r.permissions->>'can_manage_users')::boolean = true
    )
  );

-- Create default roles for existing tenants
DO $$
DECLARE
  tenant_record RECORD;
  admin_role_id uuid;
  waiter_role_id uuid;
  cashier_role_id uuid;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    -- Admin role
    INSERT INTO roles (tenant_id, name, permissions)
    VALUES (
      tenant_record.id,
      'Yönetici',
      '{
        "can_view_tables": true,
        "can_take_orders": true,
        "can_process_payments": true,
        "can_manage_products": true,
        "can_manage_users": true,
        "can_view_reports": true,
        "can_manage_cash_register": true
      }'::jsonb
    )
    ON CONFLICT (tenant_id, name) DO NOTHING
    RETURNING id INTO admin_role_id;

    -- Waiter role
    INSERT INTO roles (tenant_id, name, permissions)
    VALUES (
      tenant_record.id,
      'Garson',
      '{
        "can_view_tables": true,
        "can_take_orders": true,
        "can_process_payments": false,
        "can_manage_products": false,
        "can_manage_users": false,
        "can_view_reports": false,
        "can_manage_cash_register": false
      }'::jsonb
    )
    ON CONFLICT (tenant_id, name) DO NOTHING
    RETURNING id INTO waiter_role_id;

    -- Cashier role
    INSERT INTO roles (tenant_id, name, permissions)
    VALUES (
      tenant_record.id,
      'Kasiyer',
      '{
        "can_view_tables": true,
        "can_take_orders": false,
        "can_process_payments": true,
        "can_manage_products": false,
        "can_manage_users": false,
        "can_view_reports": false,
        "can_manage_cash_register": true
      }'::jsonb
    )
    ON CONFLICT (tenant_id, name) DO NOTHING
    RETURNING id INTO cashier_role_id;

    -- Update existing profiles to have admin role if they don't have a role
    UPDATE profiles
    SET role_id = admin_role_id
    WHERE tenant_id = tenant_record.id
    AND role_id IS NULL
    AND admin_role_id IS NOT NULL;
  END LOOP;
END $$;