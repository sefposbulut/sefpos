-- GoTrue e-posta/şifre girişi: phone* metin alanları '' veya sadece boşluk olmamalı — NULL olmalı
-- supabase/supabase#43193: token alanları '', phone alanları NULL kalmalı.
-- 20260510120000 toplu '' güncellemesi phone sütunlarını bozmuş olabilir.

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

-- auth.identities (email): provider_id ve identity_data sağlam
UPDATE auth.identities i
SET
  provider_id = u.id::text,
  identity_data = COALESCE(i.identity_data, '{}'::jsonb)
    || jsonb_build_object('sub', u.id::text, 'email', coalesce(u.email, ''))
FROM auth.users u
WHERE i.user_id = u.id
  AND i.provider = 'email'
  AND (i.provider_id IS NULL OR btrim(i.provider_id::text) = '');

-- Demo hesap: token stringler + phone NULL (yukarıdaki genel güncelleme yeterli olabilir; tekrar güvenli)
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
