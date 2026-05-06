-- GoTrue bazı sürümlerde auth.users içinde ek metin sütunları NULL iken
-- yine "Database error querying schema" / sql.Scan string hatası verir.
-- Telefon ile ilgili sütunlara dokunmuyoruz (NULL kalmalı).

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
