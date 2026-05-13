-- Şube sabit iskonto yüzdesini kesirli (numeric(5,2)) yapar.
-- Önceki 20260515220000_branches_default_discount.sql integer olarak eklemişti;
-- müşteriler %3,38 gibi kesirli oranlar girebilsin diye numeric'e geçiriyoruz.

ALTER TABLE public.branches
  ALTER COLUMN default_discount_percent TYPE numeric(5,2)
  USING default_discount_percent::numeric(5,2);

ALTER TABLE public.branches
  ALTER COLUMN default_discount_percent SET DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branches_default_discount_percent_range'
  ) THEN
    ALTER TABLE public.branches DROP CONSTRAINT branches_default_discount_percent_range;
  END IF;
END $$;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_default_discount_percent_range
  CHECK (default_discount_percent >= 0 AND default_discount_percent <= 100);

NOTIFY pgrst, 'reload schema';
