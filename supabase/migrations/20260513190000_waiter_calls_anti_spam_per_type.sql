-- waiter_calls anti-spam triggerını call_type bazına böl.
--
-- Eski: aynı masadan 30 saniye içinde herhangi bir çağrı engelleniyordu →
--       müşteri hesap isteyip hemen su isteyemiyordu.
-- Yeni: aynı (branch_id, table_label, call_type) için 8 saniye boyunca
--       aynı tipi engelle; farklı tipler hemen geçer.
-- Ek: hızlı kontrol için partial index.

BEGIN;

CREATE OR REPLACE FUNCTION public.waiter_calls_anti_spam()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.waiter_calls w
    WHERE w.branch_id = NEW.branch_id
      AND COALESCE(w.table_label,'') = COALESCE(NEW.table_label,'')
      AND w.call_type = NEW.call_type
      AND w.status IN ('pending','seen')
      AND w.created_at > now() - INTERVAL '8 seconds'
  ) THEN
    RAISE EXCEPTION 'Cok hizli pesi sira cagri yaptiniz. Lutfen birkac saniye bekleyip tekrar deneyin.'
      USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

-- Anti-spam ve genel listeler için hızlı arama indeksi
CREATE INDEX IF NOT EXISTS idx_waiter_calls_branch_status_created
  ON public.waiter_calls (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiter_calls_tenant_created
  ON public.waiter_calls (tenant_id, created_at DESC);

COMMIT;
