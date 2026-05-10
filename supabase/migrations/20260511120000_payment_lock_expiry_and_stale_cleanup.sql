/*
  # Ödeme kilidi: süre dolunca ve sekme yenilemesinde takılı kalmayı önle

  - `unlock_stale_payment_locks()` artık `payment_lock_expires_at` süresi geçmiş
    kilitleri de temizler ve `payment_locked_at` 4 dakikadan eski kilitleri
    (eski istemciler / heartbeat kesilmesi) kaldırır.
  - `unlock_table_payment` yönetici kilidi açarken süre ve oturum alanlarını da sıfırlar.
  - authenticated rolüne RPC EXECUTE izni (TableGrid / istemci çağrısı için).
*/

CREATE OR REPLACE FUNCTION public.unlock_stale_payment_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.restaurant_tables
  SET
    payment_locked = false,
    payment_locked_at = NULL,
    payment_locked_by_session = NULL,
    payment_lock_expires_at = NULL
  WHERE payment_locked = true
    AND (
      (payment_lock_expires_at IS NOT NULL AND payment_lock_expires_at < now())
      OR (payment_locked_at IS NOT NULL AND payment_locked_at < now() - INTERVAL '4 minutes')
      OR (payment_locked_at IS NULL AND payment_lock_expires_at IS NULL)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_stale_payment_locks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_stale_payment_locks() TO service_role;

CREATE OR REPLACE FUNCTION public.unlock_table_payment(
  p_table_id uuid,
  p_reason text DEFAULT 'Manual override by admin'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table record;
  v_tenant_id uuid;
  v_user_role text;
BEGIN
  SELECT id, tenant_id INTO v_table FROM public.restaurant_tables WHERE id = p_table_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Table not found');
  END IF;

  v_tenant_id := v_table.tenant_id;

  SELECT role INTO v_user_role FROM public.profiles
  WHERE id = auth.uid() AND tenant_id = v_tenant_id;

  IF v_user_role NOT IN ('owner', 'manager', 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.restaurant_tables
  SET
    payment_locked = false,
    payment_locked_at = NULL,
    payment_unlock_reason = p_reason,
    payment_lock_expires_at = NULL,
    payment_locked_by_session = NULL
  WHERE id = p_table_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Table unlocked successfully',
    'reason', p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_unlock_table_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE public.restaurant_tables
    SET
      payment_locked = false,
      payment_locked_at = NULL,
      payment_unlock_reason = 'Auto-unlocked: Order cancelled',
      payment_lock_expires_at = NULL,
      payment_locked_by_session = NULL
    WHERE id = NEW.table_id;
  END IF;

  RETURN NEW;
END;
$$;
