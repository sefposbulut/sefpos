/*
  # Add branch_id to table_groups

  ## Summary
  Each branch can now have its own independent table groups (e.g., "Salon", "Bahçe").
  Previously table groups were tenant-wide; now they are branch-specific.

  ## Changes
  - Add `branch_id` column to `table_groups` (nullable, FK → branches)
  - Update RLS on `table_groups`:
    - Owner/admin see all table groups for their tenant
    - Branch user sees only their branch's table groups
  - Products/categories remain tenant-wide (no branch_id needed)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_groups' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE table_groups ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_table_groups_branch_id ON table_groups(branch_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can view own table groups" ON table_groups;
DROP POLICY IF EXISTS "Managers can manage table groups" ON table_groups;
DROP POLICY IF EXISTS "Branch isolated table groups view" ON table_groups;
DROP POLICY IF EXISTS "Branch isolated table groups insert" ON table_groups;
DROP POLICY IF EXISTS "Branch isolated table groups update" ON table_groups;
DROP POLICY IF EXISTS "Branch isolated table groups delete" ON table_groups;

CREATE POLICY "Branch isolated table groups view"
  ON table_groups FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id IS NULL
      OR branch_id = get_my_branch_id()
    )
  );

CREATE POLICY "Branch isolated table groups insert"
  ON table_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
    )
  );

CREATE POLICY "Branch isolated table groups update"
  ON table_groups FOR UPDATE
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
    )
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
    )
  );

CREATE POLICY "Branch isolated table groups delete"
  ON table_groups FOR DELETE
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
    )
  );
