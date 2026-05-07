-- Fix: waiter_calls anon INSERT — RLS WITH CHECK
-- Sorun: WITH CHECK içindeki EXISTS subquery'si bazı PostgREST/anon context'lerinde
-- branches policy'si nedeniyle FALSE döndü ve "RLS policy violation" hatası verdi.
-- Çözüm: SECURITY DEFINER bir helper fonksiyon (RLS bypass eder) ile sade WITH CHECK.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_branch_open_for_menu(
  p_branch UUID,
  p_tenant UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch
      AND b.tenant_id = p_tenant
      AND b.is_active = TRUE
      AND COALESCE(b.menu_enabled, TRUE) = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_branch_open_for_menu(UUID, UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "waiter_calls anon insert" ON public.waiter_calls;
CREATE POLICY "waiter_calls anon insert"
  ON public.waiter_calls FOR INSERT TO anon
  WITH CHECK (
    tenant_id IS NOT NULL
    AND branch_id IS NOT NULL
    AND public.is_branch_open_for_menu(branch_id, tenant_id)
    AND status = 'pending'
    AND COALESCE(call_type, 'service') IN ('service','bill','water','help')
  );

-- Rate-limit / spam koruması: aynı branch+table_label için son 30 saniyede
-- pending bir kayıt varsa yeni eklenmesini engelleyen trigger.
CREATE OR REPLACE FUNCTION public.waiter_calls_anti_spam()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.waiter_calls w
    WHERE w.branch_id = NEW.branch_id
      AND COALESCE(w.table_label,'') = COALESCE(NEW.table_label,'')
      AND w.status IN ('pending','seen')
      AND w.created_at > now() - INTERVAL '30 seconds'
  ) THEN
    RAISE EXCEPTION 'Cok hizli pesi sira cagri yaptiniz. Lutfen birkac saniye bekleyip tekrar deneyin.'
      USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waiter_calls_anti_spam_trg ON public.waiter_calls;
CREATE TRIGGER waiter_calls_anti_spam_trg
  BEFORE INSERT ON public.waiter_calls
  FOR EACH ROW EXECUTE FUNCTION public.waiter_calls_anti_spam();

COMMIT;
