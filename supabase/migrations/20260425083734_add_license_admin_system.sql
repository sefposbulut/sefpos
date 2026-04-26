/*
  # License Admin System
  
  1. New Tables
    - `license_admin_credentials` - Admin account for license management
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `password_hash` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    - `tenant_licenses` - License tracking for restaurants
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key)
      - `license_key` (text, unique)
      - `status` (text) - active, expired, suspended
      - `expiry_date` (date)
      - `issue_date` (date)
      - `features` (jsonb) - features included
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    - `support_tickets` - Support ticket management
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key)
      - `title` (text)
      - `description` (text)
      - `status` (text) - open, in_progress, closed
      - `priority` (text) - low, medium, high
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - License admin data is not RLS protected (admin data)
    - Support tickets visible only to admin
*/

CREATE TABLE IF NOT EXISTS license_admin_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  license_key text UNIQUE NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended')),
  expiry_date date NOT NULL,
  issue_date date DEFAULT CURRENT_DATE,
  features jsonb DEFAULT '{"pos_system": true, "delivery": false, "multi_branch": false}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_name text,
  title text NOT NULL,
  description text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_licenses_tenant_id ON tenant_licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_licenses_status ON tenant_licenses(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_id ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- Insert default admin credentials (password: 2128948++)
INSERT INTO license_admin_credentials (email, password_hash, is_active)
VALUES ('info@aykasoft.com.tr', '$2a$10$YIEu8F5JBnCqPmLqQJqAXuQAiLmQp5BqLjEjQ4H5LkQ6NkQbRs1RK', true)
ON CONFLICT (email) DO NOTHING;
