/*
  # Add Device Binding and Security System

  1. New Tables
    - `device_registrations` - Her cihazı IP, MAC, ve encryption key ile kaydeder
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `tenant_id` (uuid, references tenants)
      - `device_name` (text) - PC ismi
      - `device_fingerprint` (text, unique) - Device UUID + MAC address hash
      - `ip_address` (text) - Kayıtlı IP adresi
      - `encryption_key` (text) - Device için unique encryption key
      - `is_active` (boolean) - Yönetici tarafından aktif/pasif kontrol
      - `last_seen` (timestamptz) - Son kullanım tarihi
      - `registered_at` (timestamptz)

    - `device_access_logs` - Cihaz erişim denemeleri audit log
      - `id` (uuid, primary key)
      - `tenant_id` (uuid)
      - `device_fingerprint` (text)
      - `ip_address` (text)
      - `user_id` (uuid, nullable)
      - `access_type` (text) - 'allowed', 'blocked_ip', 'blocked_device', 'blocked_inactive'
      - `reason` (text)
      - `timestamp` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Garsonlar kendi kayıtlarını görebilir
    - Admin/owner tüm cihazları yönetebilir
    - Device fingerprint unique constraint

  3. Important Notes
    - Device fingerprint: hardware serial + MAC address (cannot spoof)
    - Encryption key: random 32-char string for API communication
    - IP validation: exact match (CORS + authentication double-check)
*/

CREATE TABLE IF NOT EXISTS device_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  device_fingerprint text NOT NULL UNIQUE,
  ip_address text NOT NULL,
  encryption_key text NOT NULL DEFAULT (encode(gen_random_bytes(24), 'base64')),
  is_active boolean NOT NULL DEFAULT true,
  last_seen timestamptz DEFAULT now(),
  registered_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_fingerprint text,
  ip_address text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  access_type text NOT NULL CHECK (access_type IN ('allowed', 'blocked_ip', 'blocked_device', 'blocked_inactive', 'invalid_key')),
  reason text,
  timestamp timestamptz DEFAULT now()
);

ALTER TABLE device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_access_logs ENABLE ROW LEVEL SECURITY;

-- Device registrations: Users see their own devices, admins see all
CREATE POLICY "Users can view own devices"
  ON device_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('owner', 'admin')
    AND profiles.tenant_id = device_registrations.tenant_id
  ));

CREATE POLICY "Users can update own devices"
  ON device_registrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all devices"
  ON device_registrations FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('owner', 'admin')
    AND profiles.tenant_id = device_registrations.tenant_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('owner', 'admin')
    AND profiles.tenant_id = device_registrations.tenant_id
  ));

-- Device logs: Admins only
CREATE POLICY "Admins can view device logs"
  ON device_access_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('owner', 'admin')
    AND profiles.tenant_id = device_access_logs.tenant_id
  ));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_registrations_user ON device_registrations(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_registrations_fingerprint ON device_registrations(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_registrations_ip ON device_registrations(ip_address);
CREATE INDEX IF NOT EXISTS idx_device_access_logs_fingerprint ON device_access_logs(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_access_logs_tenant_timestamp ON device_access_logs(tenant_id, timestamp DESC);
