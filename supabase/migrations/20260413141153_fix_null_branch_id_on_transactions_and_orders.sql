/*
  # Fix NULL branch_id on cash_register_transactions and orders

  ## Problem
  All existing cash_register_transactions and orders have branch_id = NULL because
  they were created before the branch system was enforced. This causes branch-based
  filtering to return 0 results even when data exists.

  ## Fix
  For each tenant that has a main branch, assign that branch's ID to all
  cash_register_transactions and orders where branch_id is currently NULL.
*/

-- Update cash_register_transactions: assign main branch to NULL branch_id records
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_register_transactions' AND column_name = 'branch_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branches'
  ) THEN
    UPDATE public.cash_register_transactions crt
    SET branch_id = b.id
    FROM public.branches b
    WHERE b.tenant_id = crt.tenant_id
      AND b.is_main = true
      AND crt.branch_id IS NULL;
  END IF;
END $$;

-- Update orders: assign main branch to NULL branch_id records
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'branch_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branches'
  ) THEN
    UPDATE public.orders o
    SET branch_id = b.id
    FROM public.branches b
    WHERE b.tenant_id = o.tenant_id
      AND b.is_main = true
      AND o.branch_id IS NULL;
  END IF;
END $$;
