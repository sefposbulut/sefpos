/*
  # Impersonation: rapor / kasa / vardiya RLS

  Ürün-kategori düzeltmesinden sonra da boş kalan ekranlar: order_items,
  payment_transactions, cash_register_transactions, kasa/expense yardımcı
  tabloları, order_cancel_logs, roles SELECT, shift_definitions / shifts /
  daily_closures — kiracı eşlemesi hâlâ `profiles.tenant_id` alt sorgusundaydı.
  Hepsi public.get_my_tenant_id() ile impersonation ile uyumlu hale getirilir.
*/

-- ─── order_items ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own tenant order items" ON public.order_items;
CREATE POLICY "Users can view own tenant order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Authenticated users can manage order items" ON public.order_items;
CREATE POLICY "Authenticated users can manage order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ─── payment_transactions ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own tenant payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own tenant payment transactions"
  ON public.payment_transactions FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can create payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can create payment transactions"
  ON public.payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can update own tenant payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can update own tenant payment transactions"
  ON public.payment_transactions FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can delete own tenant payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can delete own tenant payment transactions"
  ON public.payment_transactions FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ─── cash_register_transactions ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own tenant cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can view own tenant cash register transactions"
  ON public.cash_register_transactions FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can create cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can create cash register transactions"
  ON public.cash_register_transactions FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can update own tenant cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can update own tenant cash register transactions"
  ON public.cash_register_transactions FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ─── order_cancel_logs ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant members can view cancel logs" ON public.order_cancel_logs;
CREATE POLICY "Tenant members can view cancel logs"
  ON public.order_cancel_logs FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Tenant members can insert cancel logs" ON public.order_cancel_logs;
CREATE POLICY "Tenant members can insert cancel logs"
  ON public.order_cancel_logs FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ─── roles (SELECT; Staff raporu vb.) ─────────────────────────────────────
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.roles;
CREATE POLICY "Users can view roles in their tenant"
  ON public.roles FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ─── shift_definitions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "shift_def_select_own_tenant" ON public.shift_definitions;
CREATE POLICY "shift_def_select_own_tenant" ON public.shift_definitions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "shift_def_modify_admin" ON public.shift_definitions;
CREATE POLICY "shift_def_modify_admin" ON public.shift_definitions
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (
      public.get_my_is_super_admin() = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = public.get_my_tenant_id_direct()
          AND p.role IN ('super_admin', 'admin', 'owner', 'manager')
      )
    )
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND (
      public.get_my_is_super_admin() = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = public.get_my_tenant_id_direct()
          AND p.role IN ('super_admin', 'admin', 'owner', 'manager')
      )
    )
  );

-- ─── shifts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "shifts_select_own_tenant" ON public.shifts;
CREATE POLICY "shifts_select_own_tenant" ON public.shifts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "shifts_insert_own_tenant" ON public.shifts;
CREATE POLICY "shifts_insert_own_tenant" ON public.shifts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "shifts_update_own_tenant" ON public.shifts;
CREATE POLICY "shifts_update_own_tenant" ON public.shifts
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "shifts_delete_admin" ON public.shifts;
CREATE POLICY "shifts_delete_admin" ON public.shifts
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (
      public.get_my_is_super_admin() = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = public.get_my_tenant_id_direct()
          AND p.role IN ('super_admin', 'admin', 'owner')
      )
    )
  );

-- ─── daily_closures ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dc_select_own_tenant" ON public.daily_closures;
CREATE POLICY "dc_select_own_tenant" ON public.daily_closures
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "dc_insert_own_tenant" ON public.daily_closures;
CREATE POLICY "dc_insert_own_tenant" ON public.daily_closures
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "dc_update_admin" ON public.daily_closures;
CREATE POLICY "dc_update_admin" ON public.daily_closures
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (
      public.get_my_is_super_admin() = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = public.get_my_tenant_id_direct()
          AND p.role IN ('super_admin', 'admin', 'owner', 'manager')
      )
    )
  );

-- ─── Opsiyonel tablolar (varsa) ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cash_registers'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own tenant cash registers" ON public.cash_registers;
    CREATE POLICY "Users can view own tenant cash registers"
      ON public.cash_registers FOR SELECT
      TO authenticated
      USING (tenant_id = public.get_my_tenant_id());
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cash_movements'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own tenant cash movements" ON public.cash_movements;
    CREATE POLICY "Users can view own tenant cash movements"
      ON public.cash_movements FOR SELECT
      TO authenticated
      USING (tenant_id = public.get_my_tenant_id());

    DROP POLICY IF EXISTS "Authenticated users can create cash movements" ON public.cash_movements;
    CREATE POLICY "Authenticated users can create cash movements"
      ON public.cash_movements FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = public.get_my_tenant_id());
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expenses'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own tenant expenses" ON public.expenses;
    CREATE POLICY "Users can view own tenant expenses"
      ON public.expenses FOR SELECT
      TO authenticated
      USING (tenant_id = public.get_my_tenant_id());
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_transactions'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own tenant customer transactions" ON public.customer_transactions;
    CREATE POLICY "Users can view own tenant customer transactions"
      ON public.customer_transactions FOR SELECT
      TO authenticated
      USING (tenant_id = public.get_my_tenant_id());

    DROP POLICY IF EXISTS "Authenticated users can create customer transactions" ON public.customer_transactions;
    CREATE POLICY "Authenticated users can create customer transactions"
      ON public.customer_transactions FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = public.get_my_tenant_id());
  END IF;
END $$;
