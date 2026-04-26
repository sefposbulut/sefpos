/*
  # Add Payment Lock Auto-Unlock and Manual Override

  1. Changes
    - Add `payment_unlock_reason` column to track why kilit açıldı
    - Create function to auto-unlock payment when order is cancelled
    - Create function for admin manual unlock
  
  2. New Functions
    - `unlock_table_payment(table_id, reason)` - Admin/manager override
    - `auto_unlock_on_order_cancel()` - Trigger when order cancelled
  
  3. Security
    - Only owners/managers can manually unlock
    - Auto-unlock happens on order cancellation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'payment_unlock_reason'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN payment_unlock_reason text;
  END IF;
END $$;

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
    payment_unlock_reason = p_reason
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
      payment_unlock_reason = 'Auto-unlocked: Order cancelled'
    WHERE id = NEW.table_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_unlock_on_order_cancel ON public.orders;
CREATE TRIGGER auto_unlock_on_order_cancel
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_unlock_table_on_cancel();

GRANT EXECUTE ON FUNCTION public.unlock_table_payment(uuid, text) TO authenticated;
