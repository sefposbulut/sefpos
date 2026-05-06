-- GoTrue, auth.users satırında token alanları NULL iken şifre ile girişte
-- "Database error querying schema" / confirmation_token NULL scan hatası veriyor.
-- Boş string gerekir (Supabase auth issue #1940).

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
