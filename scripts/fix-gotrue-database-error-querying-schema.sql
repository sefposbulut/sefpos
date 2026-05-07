/*
  GoTrue şifre girişi: "Database error querying schema" / unexpected_failure

  Bu dosya şu migration'ların birleşik kopyasıdır (sıra önemli):
  - 20260507123000_auth_users_null_tokens_to_empty_string.sql
  - 20260508120000_auth_users_coalesce_gotrue_string_columns.sql
  - 20260510120000_auth_users_text_nulls_and_demo_gotrue_fix.sql
  - 20260511130000_gotrue_phone_columns_null_email_login.sql

  Kullanım: Supabase Dashboard → SQL Editor → New query → yapıştır → Run.
  Alternatif: npm run db:migrate-remote (tüm supabase/migrations uygulanır).
*/

-- --- Önce: auth.instances (boş DB'de GoTrue şema hatası) ---
DO $$
DECLARE
  inst uuid;
BEGIN
  SELECT id INTO inst FROM auth.instances ORDER BY created_at NULLS LAST, id LIMIT 1;

  IF inst IS NULL THEN
    inst := gen_random_uuid();
    INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
    VALUES (inst, inst, '{}', now(), now());
  END IF;

  UPDATE auth.users
  SET instance_id = inst
  WHERE instance_id IS NULL
     OR instance_id = '00000000-0000-0000-0000-000000000000'::uuid;
END $$;

-- --- 20260507123000 ---
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE confirmation_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR recovery_token IS NULL;

-- --- 20260508120000 ---
DO $$
DECLARE
  cols text[] := ARRAY[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'reauthentication_token'
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY cols
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = c
    ) THEN
      EXECUTE format(
        'UPDATE auth.users SET %I = COALESCE(%I, %L) WHERE %I IS NULL',
        c,
        c,
        '',
        c
      );
    END IF;
  END LOOP;
END $$;

-- --- 20260510120000 ---
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
    RAISE NOTICE 'Demo kullanıcı yok: %. Demo seed migration çalışmamış olabilir.', demo_email;
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

-- --- 20260511130000 ---
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone'
  ) THEN
    UPDATE auth.users SET phone = NULL WHERE coalesce(btrim(phone::text), '') = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_change'
  ) THEN
    UPDATE auth.users SET phone_change = NULL WHERE coalesce(btrim(phone_change::text), '') = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_change_token'
  ) THEN
    UPDATE auth.users SET phone_change_token = NULL WHERE coalesce(btrim(phone_change_token::text), '') = '';
  END IF;
END $$;

UPDATE auth.identities i
SET
  provider_id = u.id::text,
  identity_data = COALESCE(i.identity_data, '{}'::jsonb)
    || jsonb_build_object('sub', u.id::text, 'email', coalesce(u.email, ''))
FROM auth.users u
WHERE i.user_id = u.id
  AND i.provider = 'email'
  AND (i.provider_id IS NULL OR btrim(i.provider_id::text) = '');

UPDATE auth.users u
SET
  phone = NULL,
  phone_change = NULL,
  phone_change_token = NULL,
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
WHERE lower(u.email) = lower('info@sefpos.com.tr');

-- --- Ek: dahili Auth rolü (nadir: izinler bozulduysa; hata alırsanız satırları yorumlayıp Support’a yazın) ---
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
