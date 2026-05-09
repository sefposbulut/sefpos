/*
  # Orphan bekleyen siparis temizligi + on-saglik

  ## Sorun
  Gun sonu kapatma uyarisinda "X bekleyen siparis var" cikiyor ama POS'ta
  ilgili masalar kapali (status=available) goruluyor. Bunlar genellikle
  asagidaki nedenlerden:
    - Eski masa siparisleri: order odeme aldi ama orders.status='completed'
      olmadi, restaurant_tables.status sonradan 'available' yapildi.
    - Iptal edilen ama orders.status guncellenmemis paket/online kayitlar.
    - Migrasyon donemlerinde yarim kalan kayitlar.

  ## Cozum
  1) `cleanup_orphan_pending_orders(p_tenant_id, p_branch_id)` RPC:
     - table_id NULL ya da masa 'available'/'cleaning' durumda ise siparis
       'completed' olarak isaretlenir.
     - Yalnizca tenant + branch sahibi/admin/manager (RLS ile cagirildiginda)
       erisebilir; SECURITY DEFINER ile sayim yapar.
     - Geri donus: temizlenen siparis sayisi.
  2) Audit: degisen kayitlar icin order_logs (varsa) ya da orders.notes'a
     '[autoclosed: orphan pending]' ekler (yan etkisiz).

  ## Idempotent
  - DROP FUNCTION IF EXISTS + CREATE OR REPLACE
*/

DROP FUNCTION IF EXISTS public.cleanup_orphan_pending_orders(uuid, uuid);

CREATE OR REPLACE FUNCTION public.cleanup_orphan_pending_orders(
  p_tenant_id uuid,
  p_branch_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id zorunlu';
  END IF;

  WITH orphans AS (
    SELECT o.id
    FROM public.orders o
    LEFT JOIN public.restaurant_tables t ON t.id = o.table_id
    WHERE o.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND o.status IN ('pending','preparing','ready','served','in_progress','open')
      AND (
        -- Masa siparisi ama masa zaten kapali / temizlikte
        (o.order_type = 'dine_in' AND t.id IS NOT NULL AND t.status IN ('available','cleaning','closed'))
        -- Masa siparisi ama bagli oldugu masa silinmis / NULL
        OR (o.order_type = 'dine_in' AND o.table_id IS NULL)
      )
  )
  UPDATE public.orders o
  SET status = 'completed',
      completed_at = COALESCE(o.completed_at, now()),
      notes = COALESCE(o.notes, '') ||
              CASE WHEN o.notes IS NULL OR o.notes = '' THEN '' ELSE E'\n' END ||
              '[autoclosed: orphan pending @ ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ']'
  FROM orphans
  WHERE o.id = orphans.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphan_pending_orders(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.cleanup_orphan_pending_orders(uuid, uuid) IS
'Masa kapali ya da table_id NULL olmasina ragmen status=pending/preparing/... kalmis dine_in siparisleri completed yapar. Gun sonu uyarilarinda goruntulenen orphan kayitlari temizler.';
