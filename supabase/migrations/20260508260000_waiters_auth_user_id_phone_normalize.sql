/*
  Telefon: waiters.phone bazen 0532…, auth e-postası m532… (baştaki 0 yok).
  normalize_tr_phone_digits ile eşleştirme düzeltilir.
*/

CREATE OR REPLACE FUNCTION public.normalize_tr_phone_digits(src text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  x text;
BEGIN
  x := regexp_replace(coalesce(src, ''), '[^0-9]', '', 'g');
  IF length(x) >= 12 AND left(x, 2) = '90' THEN
    RETURN substring(x FROM 3);
  END IF;
  IF length(x) = 11 AND left(x, 2) = '05' THEN
    RETURN substring(x FROM 2);
  END IF;
  RETURN x;
END;
$$;

UPDATE public.waiters w
SET auth_user_id = p.id
FROM public.profiles p
WHERE w.auth_user_id IS NULL
  AND p.tenant_id = w.tenant_id
  AND COALESCE(lower(p.role::text), '') IN ('waiter', 'courier')
  AND lower(split_part(p.email, '@', 1)) LIKE 'm%'
  AND public.normalize_tr_phone_digits(w.phone) =
      substring(lower(split_part(p.email, '@', 1)) FROM 2);

UPDATE public.waiters w
SET auth_user_id = p.id
FROM public.profiles p
WHERE w.auth_user_id IS NULL
  AND p.id = w.id
  AND p.tenant_id = w.tenant_id;

UPDATE public.waiters w
SET auth_user_id = p.id
FROM public.profiles p
WHERE w.auth_user_id IS NULL
  AND p.tenant_id = w.tenant_id
  AND COALESCE(lower(p.role::text), '') IN ('waiter', 'courier')
  AND nullif(regexp_replace(coalesce(p.phone::text, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
  AND public.normalize_tr_phone_digits(p.phone::text) = public.normalize_tr_phone_digits(w.phone);

NOTIFY pgrst, 'reload schema';
