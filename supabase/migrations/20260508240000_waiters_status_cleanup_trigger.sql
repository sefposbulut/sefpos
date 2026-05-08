/*
  Garson pasif/silinince cihaz erişimini DB tetikleyicisiyle hemen kapatır.
  Realtime UPDATE/DELETE event'lerinde tam OLD row akabilmesi için
  REPLICA IDENTITY FULL uygulanır.
*/

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

    RETURN OLD;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_cleanup_waiter_device_access_on_waiter_update ON public.waiters;
CREATE TRIGGER trg_cleanup_waiter_device_access_on_waiter_update
AFTER UPDATE OF status ON public.waiters
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_waiter_device_access_on_waiter_change();

DROP TRIGGER IF EXISTS trg_cleanup_waiter_device_access_on_waiter_delete ON public.waiters;
CREATE TRIGGER trg_cleanup_waiter_device_access_on_waiter_delete
AFTER DELETE ON public.waiters
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_waiter_device_access_on_waiter_change();

ALTER TABLE public.waiters         REPLICA IDENTITY FULL;
ALTER TABLE public.device_bindings REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
