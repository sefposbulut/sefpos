-- profiles.role_id degistiginde profiles.role (text) alanini otomatik
-- senkronlayan trigger. Boylece create-user / update-user / Turkce rol adlari
-- nedeniyle olusan tutarsizliklarda Header / RLS / izin kontrolu hep dogru rol
-- degeri gorur. Eski kayitlari da bu trigger mantigina gore tek seferlik onarir.

BEGIN;

-- 0) profiles_role_check constraint'ini genislet:
--    Eski constraint sadece (owner|admin|waiter|kitchen|cashier) kabul ediyordu;
--    'manager' ve 'courier' rollerini de izin verelim. Trigger mapping fonksiyonu
--    bu degerleri uretebiliyor; constraint dar oldugu icin yazma engelleniyordu.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IS NULL OR role IN ('owner','admin','manager','waiter','kitchen','cashier','courier','super_admin')
);

-- 1) role_id -> role text mapping fonksiyonu
CREATE OR REPLACE FUNCTION public.role_text_from_role_id(p_role_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(r.name, ''))
    WHEN 'sahip'         THEN 'owner'
    WHEN 'owner'         THEN 'owner'
    WHEN 'yönetici'      THEN 'admin'
    WHEN 'yonetici'      THEN 'admin'
    WHEN 'admin'         THEN 'admin'
    WHEN 'şube müdürü'   THEN 'manager'
    WHEN 'sube muduru'   THEN 'manager'
    WHEN 'müdür'         THEN 'manager'
    WHEN 'mudur'         THEN 'manager'
    WHEN 'manager'       THEN 'manager'
    WHEN 'kasiyer'       THEN 'cashier'
    WHEN 'cashier'       THEN 'cashier'
    WHEN 'garson'        THEN 'waiter'
    WHEN 'waiter'        THEN 'waiter'
    WHEN 'kurye'         THEN 'courier'
    WHEN 'courier'       THEN 'courier'
    ELSE NULL
  END
  FROM public.roles r
  WHERE r.id = p_role_id
$$;

GRANT EXECUTE ON FUNCTION public.role_text_from_role_id(uuid) TO authenticated, service_role;

-- 2) Trigger: profiles INSERT/UPDATE sirasinda role_id varsa role text'ini
--    otomatik turet. role text manuel set edilmis ve role_id ile uyumsuzsa
--    role_id'ye gore guncelle (role_id otoritedir).
CREATE OR REPLACE FUNCTION public.profiles_sync_role_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mapped text;
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    SELECT public.role_text_from_role_id(NEW.role_id) INTO v_mapped;
    IF v_mapped IS NOT NULL THEN
      NEW.role := v_mapped;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_text_sync ON public.profiles;
CREATE TRIGGER profiles_role_text_sync
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_sync_role_text();

-- 3) Tek seferlik onarim: mevcut kayitlarda role_id var ama role text yanlissa
--    duzelt. (Sadece mapping bulunabilenlerde calisir.)
UPDATE public.profiles p
   SET role = public.role_text_from_role_id(p.role_id)
 WHERE p.role_id IS NOT NULL
   AND public.role_text_from_role_id(p.role_id) IS NOT NULL
   AND COALESCE(p.role, '') <> public.role_text_from_role_id(p.role_id);

ANALYZE public.profiles;

COMMIT;
