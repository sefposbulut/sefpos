-- delete_tenant_cascade fonksiyonu duzeltmesi:
-- Onceki surumde restaurant_tables tablosunda 'table_group_id' kolonu kullaniliyordu
-- ama gercek kolon adi 'group_id'. Ayni zamanda restaurant_tables zaten tenant_id'ye
-- sahip, dolayisiyla group_id uzerinden filtre yapmaya gerek yok.
-- order_items de tenant_id'ye sahip, direkt silebiliriz (daha hizli).

BEGIN;

DROP FUNCTION IF EXISTS public.delete_tenant_cascade(uuid);

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_super boolean := false;
  v_caller_role text;
  v_caller_tenant uuid;
BEGIN
  -- Yetki kontrolu: super_admin veya tenant'in kendi owner/admin'i
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(is_super_admin, false), role, tenant_id
      INTO v_caller_super, v_caller_role, v_caller_tenant
    FROM public.profiles WHERE id = v_caller;

    IF NOT v_caller_super
       AND (v_caller_tenant IS DISTINCT FROM p_tenant_id OR COALESCE(v_caller_role, '') NOT IN ('owner','admin')) THEN
      RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1) Order'a bagli kayitlar (her tablo zaten tenant_id ile filtreli)
  IF to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    DELETE FROM public.payment_transactions WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.cash_register_transactions') IS NOT NULL THEN
    DELETE FROM public.cash_register_transactions WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.credit_transactions') IS NOT NULL THEN
    DELETE FROM public.credit_transactions WHERE tenant_id = p_tenant_id;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
  END IF;

  -- 2) Print jobs
  IF to_regclass('public.print_jobs') IS NOT NULL THEN
    DELETE FROM public.print_jobs WHERE tenant_id = p_tenant_id;
  END IF;

  -- 3) Garson + cihaz baglamalari
  IF to_regclass('public.waiter_calls') IS NOT NULL THEN
    DELETE FROM public.waiter_calls WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.waiter_sessions') IS NOT NULL THEN
    DELETE FROM public.waiter_sessions WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.device_binding_requests') IS NOT NULL THEN
    DELETE FROM public.device_binding_requests WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.device_bindings') IS NOT NULL THEN
    DELETE FROM public.device_bindings WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.waiters') IS NOT NULL THEN
    DELETE FROM public.waiters WHERE tenant_id = p_tenant_id;
  END IF;

  -- 4) Online sipariş + kurye + müşteri
  IF to_regclass('public.online_orders') IS NOT NULL THEN
    DELETE FROM public.online_orders WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.delivery_orders') IS NOT NULL THEN
    DELETE FROM public.delivery_orders WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.couriers') IS NOT NULL THEN
    DELETE FROM public.couriers WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.customers') IS NOT NULL THEN
    DELETE FROM public.customers WHERE tenant_id = p_tenant_id;
  END IF;

  -- 5) Stok / urun
  IF to_regclass('public.product_variants') IS NOT NULL THEN
    DELETE FROM public.product_variants
     WHERE product_id IN (SELECT id FROM public.products WHERE tenant_id = p_tenant_id);
  END IF;
  IF to_regclass('public.products') IS NOT NULL THEN
    DELETE FROM public.products WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.categories') IS NOT NULL THEN
    DELETE FROM public.categories WHERE tenant_id = p_tenant_id;
  END IF;

  -- 6) Masalar / gruplar (her ikisi de tenant_id ile direkt)
  IF to_regclass('public.restaurant_tables') IS NOT NULL THEN
    DELETE FROM public.restaurant_tables WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.table_groups') IS NOT NULL THEN
    DELETE FROM public.table_groups WHERE tenant_id = p_tenant_id;
  END IF;

  -- 7) Destek + bildirim
  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    DELETE FROM public.support_tickets WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.support_notifications') IS NOT NULL THEN
    DELETE FROM public.support_notifications WHERE tenant_id = p_tenant_id;
  END IF;

  -- 8) QR menü ayarları
  IF to_regclass('public.qr_menu_settings') IS NOT NULL THEN
    DELETE FROM public.qr_menu_settings WHERE tenant_id = p_tenant_id;
  END IF;

  -- 9) Profiller (auth.users CASCADE'i ayri; bu fonksiyon SADECE public şemayı temizler.)
  DELETE FROM public.profiles WHERE tenant_id = p_tenant_id;

  -- 10) Şubeler ve roller
  IF to_regclass('public.branches') IS NOT NULL THEN
    DELETE FROM public.branches WHERE tenant_id = p_tenant_id;
  END IF;
  IF to_regclass('public.roles') IS NOT NULL THEN
    DELETE FROM public.roles WHERE tenant_id = p_tenant_id;
  END IF;

  -- 11) Lisans ve tenant kayıtları
  IF to_regclass('public.licenses') IS NOT NULL THEN
    DELETE FROM public.licenses WHERE tenant_id = p_tenant_id;
  END IF;

  DELETE FROM public.tenants WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_tenant_cascade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tenant_cascade(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
