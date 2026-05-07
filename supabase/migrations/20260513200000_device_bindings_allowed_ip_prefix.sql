-- Garson cihazı: onay sırasında kaydedilen restoran ağ IP öneki (ilk 3 oktet).
-- Eve gidildiğinde genel IP değişir → giriş engellenir.

BEGIN;

ALTER TABLE public.device_bindings
  ADD COLUMN IF NOT EXISTS allowed_ip_prefix text;

COMMENT ON COLUMN public.device_bindings.allowed_ip_prefix IS
  'Restoran genel IP /24 veya /16 öneki (ör. 88.245.12). İstek anındaki ipPrefix kabulde kopyalanır; garson girişinde doğrulanır.';

-- Mevcut kayıtlar: son kabul edilen istekten doldur
UPDATE public.device_bindings db
SET allowed_ip_prefix = COALESCE(
  db.allowed_ip_prefix,
  NULLIF(TRIM(sub.ipfx), '')
)
FROM (
  SELECT DISTINCT ON (r.waiter_id, r.device_id)
    r.waiter_id,
    r.device_id,
    COALESCE(r.device_info->>'ipPrefix', r.device_info->>'ip_prefix', '') AS ipfx
  FROM public.device_binding_requests r
  WHERE r.status = 'accepted'
    AND r.device_info IS NOT NULL
  ORDER BY r.waiter_id, r.device_id, r.accepted_at DESC NULLS LAST, r.created_at DESC
) sub
WHERE db.waiter_id = sub.waiter_id
  AND db.device_id = sub.device_id
  AND (db.allowed_ip_prefix IS NULL OR btrim(db.allowed_ip_prefix) = '');

COMMIT;
