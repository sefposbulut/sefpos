/*
  # Create Device Validation RPC Functions

  1. Functions
    - `validate_device_access` - Cihaz erişim kontrolü (IP + fingerprint)
    - `register_new_device` - Yeni cihaz kaydı (user + fingerprint)
    - `get_device_encryption_key` - Encryption key döndür
    - `log_device_access` - Erişim denemesi kaydet

  2. Security
    - SECURITY DEFINER ile çalışır (admin yetkisi)
    - User authentication gerekli
    - Tenant isolation sağlanır
*/

CREATE OR REPLACE FUNCTION validate_device_access(
  p_device_fingerprint text,
  p_ip_address text,
  p_encryption_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_device record;
  v_is_valid boolean;
  v_reason text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    PERFORM log_device_access(NULL, p_device_fingerprint, p_ip_address, NULL, 'blocked_ip', 'Not authenticated');
    RETURN jsonb_build_object('allowed', false, 'reason', 'Not authenticated');
  END IF;

  -- Get user's tenant
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'blocked_device', 'User not in any tenant');
    RETURN jsonb_build_object('allowed', false, 'reason', 'User not in any tenant');
  END IF;

  -- Check if device registered and matches user
  SELECT * INTO v_device FROM device_registrations
  WHERE device_fingerprint = p_device_fingerprint
  AND tenant_id = v_tenant_id
  AND user_id = v_user_id;

  -- Device not found
  IF v_device IS NULL THEN
    PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'blocked_device', 'Device not registered');
    RETURN jsonb_build_object('allowed', false, 'reason', 'Device not registered for this user', 'register_required', true);
  END IF;

  -- Device inactive
  IF NOT v_device.is_active THEN
    PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'blocked_inactive', 'Device deactivated by admin');
    RETURN jsonb_build_object('allowed', false, 'reason', 'Device has been deactivated by administrator');
  END IF;

  -- Check IP address
  IF v_device.ip_address != p_ip_address THEN
    PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'blocked_ip', 
      'IP mismatch: expected ' || v_device.ip_address || ', got ' || p_ip_address);
    RETURN jsonb_build_object('allowed', false, 'reason', 'Device IP address does not match registered IP');
  END IF;

  -- Check encryption key
  IF v_device.encryption_key != p_encryption_key THEN
    PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'invalid_key', 'Invalid encryption key');
    RETURN jsonb_build_object('allowed', false, 'reason', 'Invalid device encryption key');
  END IF;

  -- Update last seen
  UPDATE device_registrations
  SET last_seen = now()
  WHERE id = v_device.id;

  PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'allowed', NULL);
  RETURN jsonb_build_object('allowed', true, 'device_name', v_device.device_name);
END;
$$;

CREATE OR REPLACE FUNCTION register_new_device(
  p_device_name text,
  p_device_fingerprint text,
  p_ip_address text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_new_key text;
  v_existing record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get user's tenant
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not in any tenant');
  END IF;

  -- Check if device already registered
  SELECT * INTO v_existing FROM device_registrations
  WHERE device_fingerprint = p_device_fingerprint
  AND tenant_id = v_tenant_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing.user_id = v_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Device already registered for this user');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Device already registered for another user in this tenant');
    END IF;
  END IF;

  -- Create new device registration
  INSERT INTO device_registrations (user_id, tenant_id, device_name, device_fingerprint, ip_address)
  VALUES (v_user_id, v_tenant_id, p_device_name, p_device_fingerprint, p_ip_address)
  RETURNING encryption_key INTO v_new_key;

  PERFORM log_device_access(v_tenant_id, p_device_fingerprint, p_ip_address, v_user_id, 'allowed', 'Device registered');

  RETURN jsonb_build_object(
    'success', true,
    'encryption_key', v_new_key,
    'message', 'Device registered successfully. Please save the encryption key securely.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_device_encryption_key(
  p_device_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_device record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not in any tenant');
  END IF;

  SELECT * INTO v_device FROM device_registrations
  WHERE device_fingerprint = p_device_fingerprint
  AND tenant_id = v_tenant_id
  AND user_id = v_user_id;

  IF v_device IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'encryption_key', v_device.encryption_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION log_device_access(
  p_tenant_id uuid,
  p_device_fingerprint text,
  p_ip_address text,
  p_user_id uuid,
  p_access_type text,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO device_access_logs (tenant_id, device_fingerprint, ip_address, user_id, access_type, reason)
  VALUES (p_tenant_id, p_device_fingerprint, p_ip_address, p_user_id, p_access_type, p_reason);
END;
$$;
