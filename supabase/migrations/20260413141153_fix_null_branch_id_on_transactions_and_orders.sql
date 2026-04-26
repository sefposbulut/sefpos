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
UPDATE cash_register_transactions crt
SET branch_id = b.id
FROM branches b
WHERE b.tenant_id = crt.tenant_id
  AND b.is_main = true
  AND crt.branch_id IS NULL;

-- Update orders: assign main branch to NULL branch_id records  
UPDATE orders o
SET branch_id = b.id
FROM branches b
WHERE b.tenant_id = o.tenant_id
  AND b.is_main = true
  AND o.branch_id IS NULL;
