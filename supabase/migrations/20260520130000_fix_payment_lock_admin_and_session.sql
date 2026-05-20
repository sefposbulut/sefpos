/*
  # Ödeme kilidi: admin kilidi açma + aynı oturum yenileme

  - unlock_table_payment: profiles.role = 'admin' (Yönetici) dahil
  - unlock_stale_payment_locks: aynı oturum süresi dolmuş kilitleri de temizler
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

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager', 'super_admin') THEN
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

GRANT EXECUTE ON FUNCTION public.unlock_table_payment(uuid, text) TO authenticated;
