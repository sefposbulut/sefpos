-- Ürün sayımı: tenant başına artan belge numarası (SAYIM-00001, …) ve atomik tahsis

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_count_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches (id) ON DELETE SET NULL,
  seq integer NOT NULL,
  reference_no text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (tenant_id, seq),
  UNIQUE (tenant_id, reference_no)
);

CREATE INDEX IF NOT EXISTS idx_stock_count_batches_tenant_created
  ON public.stock_count_batches (tenant_id, created_at DESC);

ALTER TABLE public.stock_count_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stock_count_batches FROM anon;

DROP POLICY IF EXISTS "stock_count_batches_tenant_access" ON public.stock_count_batches;

CREATE POLICY "stock_count_batches_tenant_access"
  ON public.stock_count_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.tenant_id = stock_count_batches.tenant_id
        )
    )
  );

COMMENT ON TABLE public.stock_count_batches IS 'Ürün sayımı uygulama belgeleri; reference_no stock_movements ile eşleşir.';

CREATE OR REPLACE FUNCTION public.create_stock_count_batch(
  p_tenant_id uuid,
  p_branch_id uuid
)
RETURNS TABLE (batch_id uuid, seq integer, reference_no text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_next integer;
  v_ref text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = v_uid
      AND (
        COALESCE(pr.is_super_admin, false) = true
        OR pr.tenant_id = p_tenant_id
      )
  )
  INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 42424242));

  SELECT COALESCE(MAX(b.seq), 0) + 1
  INTO v_next
  FROM public.stock_count_batches b
  WHERE b.tenant_id = p_tenant_id;

  v_ref := 'SAYIM-' || lpad(v_next::text, 5, '0');
  v_id := gen_random_uuid();

  INSERT INTO public.stock_count_batches (id, tenant_id, branch_id, seq, reference_no, created_by)
  VALUES (v_id, p_tenant_id, p_branch_id, v_next, v_ref, v_uid);

  RETURN QUERY
  SELECT v_id, v_next, v_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_count_batch(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_count_batch(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_stock_count_batch IS 'Atomik sayım belge numarası üretir (SAYIM-#####).';

COMMIT;
