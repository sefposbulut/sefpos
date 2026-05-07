-- Profiles tablosuna gercek kullanici adi + telefon alanlari ekler ve
-- giris ekraninin email/telefon/kullanici adi ile cozumleme yapabilmesi
-- icin gerekli indeks + anon RLS politikasini kurar.
--
-- Tasarim:
--  * profiles.username TEXT (opsiyonel, lower-case saklanir)
--  * profiles.phone    TEXT (opsiyonel, normalize edilmis 11 hane)
--  * (tenant_id, lower(username)) unique  -> ayni firmada cakilma yok
--  * lower(username) ve phone BTREE index -> hizli lookup
--  * Backfill: mevcut '<x>@<tenant8>.shefpos.local' email'lerinden
--    username olarak '<x>' yazilir (zaten lowercase + a-z0-9).
--  * Anon SELECT: email LIKE '%.shefpos.local' VEYA username/phone IS NOT NULL.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN username TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone TEXT;
  END IF;
END $$;

-- Backfill: mevcut <user>@<tenant8>.shefpos.local email'lerinden username uret
UPDATE public.profiles
   SET username = lower(split_part(email, '@', 1))
 WHERE username IS NULL
   AND email IS NOT NULL
   AND email LIKE '%@%.shefpos.local';

-- Lower-case'e normalize et (kullanici buyuk harfle yazsa bile)
UPDATE public.profiles
   SET username = lower(username)
 WHERE username IS NOT NULL AND username <> lower(username);

-- (tenant_id, lower(username)) unique
CREATE UNIQUE INDEX IF NOT EXISTS profiles_tenant_username_unique
  ON public.profiles (tenant_id, lower(username))
  WHERE username IS NOT NULL;

-- Login lookup indeksleri
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_phone_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

-- Anon SELECT politikasini guncelle: username/phone ile login icin
DROP POLICY IF EXISTS "Anon can lookup email for login" ON public.profiles;

CREATE POLICY "Anon login identifier lookup"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (
    (email IS NOT NULL AND email LIKE '%.shefpos.local')
    OR username IS NOT NULL
    OR phone IS NOT NULL
  );

ANALYZE public.profiles;

COMMIT;
