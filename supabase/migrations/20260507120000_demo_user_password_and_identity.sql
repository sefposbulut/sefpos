-- Demo giriş: info@sefpos.com.tr / 2128948++
-- Eski seed yalnızca auth.users satırı ekliyordu; şifre hash ve auth.identities olmadan
-- Supabase Auth ile giriş yapılamaz.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
    RAISE NOTICE 'Demo auth kullanıcısı yok (%). Önce tenants/demo verisi oluşturulmuş olmalı.', demo_email;
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
      recovery_token = COALESCE(recovery_token, ''),
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
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
