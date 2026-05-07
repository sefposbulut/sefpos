-- GoTrue "Database error querying schema" / sql.Scan NULL string:
-- Yeni sürümlerde auth.users içinde ek text sütunları NULL kalabiliyor.
-- Demo: info@sefpos.com.tr / 2128948++ — şifre + identities garanti.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tüm kullanıcılar: NULL kalan text/varchar (email/şifre/rol hariç) -> ''
DO $$
DECLARE
  r record;
  skip text[] := ARRAY['email', 'encrypted_password', 'aud', 'role'];
BEGIN
  FOR r IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND is_nullable = 'YES'
      AND data_type IN ('text', 'character varying', 'character')
      AND NOT (column_name = ANY (skip))
  LOOP
    EXECUTE format('UPDATE auth.users SET %I = %L WHERE %I IS NULL', r.column_name, '', r.column_name);
  END LOOP;
END $$;

UPDATE auth.users
SET aud = 'authenticated'
WHERE aud IS NULL OR trim(aud) = '';

UPDATE auth.users
SET role = 'authenticated'
WHERE role IS NULL OR trim(role) = '';

UPDATE auth.users
SET
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
WHERE raw_app_meta_data IS NULL OR raw_user_meta_data IS NULL;

-- 2) Demo kullanıcı: şifre + instance + identities
DO $$
DECLARE
  inst uuid;
  uid uuid;
  demo_email text := 'info@sefpos.com.tr';
BEGIN
  SELECT id INTO inst FROM auth.instances ORDER BY id LIMIT 1;
  IF inst IS NULL THEN
    inst := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(demo_email) LIMIT 1;

  IF uid IS NULL THEN
    RAISE NOTICE 'Demo kullanıcı yok: %. Önce 20260504150000 migration çalışmış olmalı.', demo_email;
  ELSE
    UPDATE auth.users
    SET
      instance_id = COALESCE(instance_id, inst),
      aud = 'authenticated',
      role = 'authenticated',
      encrypted_password = crypt('2128948++', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmation_token = COALESCE(confirmation_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      recovery_token = COALESCE(recovery_token, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      updated_at = now()
    WHERE id = uid;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'auth' AND table_name = 'identities'
    ) THEN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        uid,
        jsonb_build_object('sub', uid::text, 'email', demo_email),
        'email',
        uid::text,
        now(),
        now(),
        now()
      WHERE NOT EXISTS (
        SELECT 1 FROM auth.identities i WHERE i.user_id = uid AND i.provider = 'email'
      );
    END IF;
  END IF;
END $$;
