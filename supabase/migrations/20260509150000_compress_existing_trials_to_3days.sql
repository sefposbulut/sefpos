/*
  # Mevcut trial tenant'larini 3 gun limitine cek

  ## Amac
  Onceki trigger 14 gunluk trial veriyordu. Yeni standart 3 gun.
  Bu migration plan='trial' olan tenant'lar icin bitis tarihini
  yeniden hesaplar (created_at + 3 gun) ve status'u 'trial' olarak
  isaretler — eski 'active' kayitlar trial badge ile dogru gozuksun
  diye.

  ## Notlar
  - Suspended / cancelled tenant'lar dokunulmaz.
  - 3 gun gectiyse expires_at gecmiste kalir → UI overlay otomatik tetiklenir.
*/

UPDATE public.tenants
SET
  subscription_expires_at = created_at + interval '3 days',
  subscription_status = 'trial'
WHERE subscription_plan = 'trial'
  AND COALESCE(subscription_status, 'active') NOT IN ('suspended', 'cancelled');

NOTIFY pgrst, 'reload schema';
