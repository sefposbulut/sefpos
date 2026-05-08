-- Her tenant icin "Sahip" rolunu ekle (tam yetki). Ilk migration'da yalnizca
-- Yonetici/Garson/Kasiyer vardi; owner hesaplari cogu zaman Yonetici role_id ile
-- kaliyordu ve "Sahip" rol ve yetki listesinde gorunmuyordu.

BEGIN;

INSERT INTO public.roles (tenant_id, name, permissions)
SELECT t.id,
       'Sahip',
       '{
         "can_view_tables": true,
         "can_take_orders": true,
         "can_process_payments": true,
         "can_delete_order_items": true,
         "can_manage_discounts": true,
         "can_manage_products": true,
         "can_manage_cash_register": true,
         "can_view_reports": true,
         "can_end_of_day": true,
         "can_view_cancel_logs": true,
         "can_manage_users": true,
         "can_manage_settings": true
       }'::jsonb
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO UPDATE
  SET permissions = EXCLUDED.permissions;

UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE p.role = 'owner'
  AND p.tenant_id = r.tenant_id
  AND r.name = 'Sahip';

COMMIT;
