/*
  Supabase Cloud GoTrue, tüm auth sorgularında
  instance_id = '00000000-0000-0000-0000-000000000000' (zero-UUID)
  filtresini kullanır. Daha önceki migrasyonlarda rastgele bir UUID
  seçilirse "Database error querying schema / finding users" gibi 500'lere
  yol açar; bu migrasyon her zaman zero-UUID'ye normalize eder.
*/
DO $$
DECLARE
  zero uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- 1) Zero-UUID instance kaydı her zaman var olmalı
  INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
  VALUES (zero, zero, '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- 2) Tüm auth.users zero-UUID'ye taşı
  UPDATE auth.users
     SET instance_id = zero
   WHERE instance_id IS DISTINCT FROM zero;

  -- 3) Diğer auth tablolarındaki instance_id alanları
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'sessions' AND column_name = 'instance_id'
  ) THEN
    UPDATE auth.sessions SET instance_id = zero WHERE instance_id IS DISTINCT FROM zero;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'refresh_tokens' AND column_name = 'instance_id'
  ) THEN
    UPDATE auth.refresh_tokens SET instance_id = zero WHERE instance_id IS DISTINCT FROM zero;
  END IF;

  -- 4) Eski rastgele instance kayıtlarını temizle
  DELETE FROM auth.instances WHERE id <> zero;
END $$;

-- 5) GoTrue'nin scan ettiği text alanlar NULL olamaz; phone tekil indeksi
--    bozulmasın diye phone hariç tutuluyor.
UPDATE auth.users
   SET aud                        = COALESCE(aud, ''),
       role                       = COALESCE(role, ''),
       email                      = COALESCE(email, ''),
       confirmation_token         = COALESCE(confirmation_token, ''),
       recovery_token             = COALESCE(recovery_token, ''),
       email_change_token_new     = COALESCE(email_change_token_new, ''),
       email_change               = COALESCE(email_change, ''),
       phone_change               = COALESCE(phone_change, ''),
       phone_change_token         = COALESCE(phone_change_token, ''),
       email_change_token_current = COALESCE(email_change_token_current, ''),
       reauthentication_token     = COALESCE(reauthentication_token, '')
 WHERE aud IS NULL
    OR role IS NULL
    OR email IS NULL
    OR confirmation_token IS NULL
    OR recovery_token IS NULL
    OR email_change_token_new IS NULL
    OR email_change IS NULL
    OR phone_change IS NULL
    OR phone_change_token IS NULL
    OR email_change_token_current IS NULL
    OR reauthentication_token IS NULL;
