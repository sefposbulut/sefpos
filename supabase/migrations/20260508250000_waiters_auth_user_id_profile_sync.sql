/*
  Garson satırı (waiters) ile giriş profili (profiles.id = auth.users.id) farklı UUID olabiliyor.
  Kullanıcı yönetiminde profil pasife alınınca waiters.status güncellenmiyor ve
  device_bindings yanlış waiter_id (profil id) ile aranıyordu.

  Çözüm: waiters.auth_user_id → auth.users(id), geri doldurma + çift yönlü senkron.
*/

-- 1) Kolon
ALTER TABLE public.waiters
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waiters_auth_user_id_uq
  ON public.waiters(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN public.waiters.auth_user_id IS 'Supabase Auth kullanıcı id (profiles.id); garson PIN oturumu bu kayıtla eşlenir.';

-- 2) Mevcut kayıtları e-posta (m{telefon}@) veya profiles.phone ile eşle
UPDATE public.waiters w
SET auth_user_id = p.id
FROM public.profiles p
WHERE w.auth_user_id IS NULL
  AND p.tenant_id = w.tenant_id
  AND COALESCE(lower(p.role::text), '') IN ('waiter', 'courier')
  AND (
    (
      lower(split_part(p.email, '@', 1)) LIKE 'm%'
      AND substring(lower(split_part(p.email, '@', 1)) from 2) =
          regexp_replace(coalesce(w.phone, ''), '[^0-9]', '', 'g')
    )
    OR (
      nullif(regexp_replace(coalesce(p.phone::text, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
      AND regexp_replace(coalesce(p.phone::text, ''), '[^0-9]', '', 'g') =
          regexp_replace(coalesce(w.phone, ''), '[^0-9]', '', 'g')
    )
  );

-- 3) waiters → profil + cihaz temizliği (status değişince)
CREATE OR REPLACE FUNCTION public.cleanup_waiter_device_access_on_waiter_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(NEW.status, '') <> 'active'
       AND coalesce(OLD.status, '') = 'active' THEN
      UPDATE public.device_bindings
         SET status = 'inactive'
       WHERE waiter_id = NEW.id
         AND tenant_id = NEW.tenant_id
         AND status = 'active';

      UPDATE public.device_binding_requests
         SET status = 'rejected'
       WHERE waiter_id = NEW.id
         AND tenant_id = NEW.tenant_id
         AND status IN ('pending', 'accepted');

      IF NEW.auth_user_id IS NOT NULL THEN
        UPDATE public.profiles
           SET is_active = false
         WHERE id = NEW.auth_user_id
           AND COALESCE(is_active, true) = true;
      END IF;
    ELSIF coalesce(NEW.status, '') = 'active'
          AND coalesce(OLD.status, '') <> 'active'
          AND NEW.auth_user_id IS NOT NULL THEN
      UPDATE public.profiles
         SET is_active = true
       WHERE id = NEW.auth_user_id
         AND COALESCE(is_active, false) = false;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.device_bindings
       SET status = 'inactive'
     WHERE waiter_id = OLD.id
       AND tenant_id = OLD.tenant_id
       AND status = 'active';

    UPDATE public.device_binding_requests
       SET status = 'rejected'
     WHERE waiter_id = OLD.id
       AND tenant_id = OLD.tenant_id
       AND status IN ('pending', 'accepted');

    IF OLD.auth_user_id IS NOT NULL THEN
      UPDATE public.profiles
         SET is_active = false
       WHERE id = OLD.auth_user_id
         AND COALESCE(is_active, true) = true;
    END IF;

    RETURN OLD;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$fn$;

-- 4) Profil pasif → doğru garson satırı + cihaz (waiter PK = waiters.id)
CREATE OR REPLACE FUNCTION public.cleanup_waiter_device_access_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_waiter_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(NEW.role, '') NOT IN ('waiter', 'courier') THEN
      RETURN NEW;
    END IF;

    SELECT w.id INTO v_waiter_id
    FROM public.waiters w
    WHERE w.tenant_id = NEW.tenant_id
      AND (w.auth_user_id = NEW.id OR (w.auth_user_id IS NULL AND w.id = NEW.id))
    LIMIT 1;

    IF v_waiter_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF coalesce(OLD.is_active, true) = true AND coalesce(NEW.is_active, true) = false THEN
      UPDATE public.waiters w
         SET status = 'inactive'
       WHERE w.id = v_waiter_id
         AND w.status IS DISTINCT FROM 'inactive';

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'device_bindings'
      ) THEN
        UPDATE public.device_bindings
           SET status = 'inactive'
         WHERE tenant_id = NEW.tenant_id
           AND waiter_id = v_waiter_id
           AND status = 'active';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'device_binding_requests'
      ) THEN
        UPDATE public.device_binding_requests
           SET status = 'rejected'
         WHERE tenant_id = NEW.tenant_id
           AND waiter_id = v_waiter_id
           AND status IN ('pending', 'accepted');
      END IF;
    ELSIF coalesce(OLD.is_active, true) = false AND coalesce(NEW.is_active, true) = true THEN
      UPDATE public.waiters w
         SET status = 'active'
       WHERE w.id = v_waiter_id
         AND w.status IS DISTINCT FROM 'active';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF coalesce(OLD.role, '') NOT IN ('waiter', 'courier') THEN
      RETURN OLD;
    END IF;

    SELECT w.id INTO v_waiter_id
    FROM public.waiters w
    WHERE w.tenant_id = OLD.tenant_id
      AND (w.auth_user_id = OLD.id OR (w.auth_user_id IS NULL AND w.id = OLD.id))
    LIMIT 1;

    IF v_waiter_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'device_bindings'
      ) THEN
        UPDATE public.device_bindings
           SET status = 'inactive'
         WHERE tenant_id = OLD.tenant_id
           AND waiter_id = v_waiter_id
           AND status = 'active';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'device_binding_requests'
      ) THEN
        UPDATE public.device_binding_requests
           SET status = 'rejected'
         WHERE tenant_id = OLD.tenant_id
           AND waiter_id = v_waiter_id
           AND status IN ('pending', 'accepted');
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_cleanup_waiter_device_access_on_profile_update ON public.profiles;
CREATE TRIGGER trg_cleanup_waiter_device_access_on_profile_update
AFTER UPDATE OF is_active, role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_waiter_device_access_on_profile_change();

DROP TRIGGER IF EXISTS trg_cleanup_waiter_device_access_on_profile_delete ON public.profiles;
CREATE TRIGGER trg_cleanup_waiter_device_access_on_profile_delete
AFTER DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_waiter_device_access_on_profile_change();

-- 5) device_bindings: profil garson satırı üzerinden kontrol
CREATE OR REPLACE FUNCTION public.guard_active_waiter_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profile record;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    SELECT p.id, p.role, p.is_active
      INTO v_profile
    FROM public.waiters w
    LEFT JOIN public.profiles p ON p.id = w.auth_user_id
    WHERE w.id = NEW.waiter_id
    LIMIT 1;

    IF v_profile.id IS NULL THEN
      SELECT id, role, is_active
        INTO v_profile
      FROM public.profiles
      WHERE id = NEW.waiter_id
      LIMIT 1;
    END IF;

    IF v_profile.id IS NOT NULL THEN
      IF coalesce(v_profile.role, '') IN ('waiter', 'courier')
         AND coalesce(v_profile.is_active, true) = false THEN
        RAISE EXCEPTION 'Cannot activate binding: waiter/courier profile is inactive';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
