-- Eksik kolonlar (frontend istemcisi bekliyor ama şemada yoktu)
-- 1) support_tickets.admin_replied_at  → admin yanıt tarihi
-- 2) profiles.is_active                → kullanıcı pasif/aktif bayrağı
-- 3) cash_register_transactions.branch_id → şube bazlı kasa işlemi

BEGIN;

-- 1) support_tickets.admin_replied_at
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ;

-- Geçmiş veride: admin_reply doluysa admin_replied_at'i updated_at ile geri doldur
UPDATE public.support_tickets
   SET admin_replied_at = COALESCE(admin_replied_at, updated_at)
 WHERE admin_reply IS NOT NULL
   AND admin_reply <> ''
   AND admin_replied_at IS NULL;

-- updated_at değiştiğinde admin_reply de değiştiyse admin_replied_at otomatik güncellensin
CREATE OR REPLACE FUNCTION public.support_tickets_set_admin_replied_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.admin_reply IS NOT NULL
     AND NEW.admin_reply <> ''
     AND (OLD.admin_reply IS DISTINCT FROM NEW.admin_reply)
  THEN
    NEW.admin_replied_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_admin_replied_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_admin_replied_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.support_tickets_set_admin_replied_at();

-- 2) profiles.is_active
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 3) cash_register_transactions.branch_id
ALTER TABLE public.cash_register_transactions
  ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Foreign key (branches tablosu mevcutsa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='branches'
  ) THEN
    -- Var olan FK varsa atla
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='public'
         AND table_name='cash_register_transactions'
         AND constraint_type='FOREIGN KEY'
         AND constraint_name='cash_register_transactions_branch_id_fkey'
    ) THEN
      ALTER TABLE public.cash_register_transactions
        ADD CONSTRAINT cash_register_transactions_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_cash_register_tx_branch_id
  ON public.cash_register_transactions(branch_id);

-- Geçmiş veride branch_id eksik kayıtları, tenant'ın "ana şube"sine bağla (varsa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='branches'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='branches' AND column_name='is_main'
  ) THEN
    UPDATE public.cash_register_transactions crt
       SET branch_id = b.id
      FROM public.branches b
     WHERE crt.branch_id IS NULL
       AND b.tenant_id = crt.tenant_id
       AND b.is_main = TRUE;
  END IF;
END$$;

COMMIT;
