/*
  # Fix RLS Policies - Optimization and Security

  ## Overview
  Optimizes RLS policies by wrapping auth.uid() calls in SELECT statements
  to prevent re-evaluation for each row. Also fixes overly permissive policies.
  
  ## Changes
  1. Wraps all auth.uid() calls with (SELECT auth.uid())
  2. Fixes policies with "true" conditions to use proper tenant checks
  3. Updates all affected tables with optimized policies
*/

-- =====================================================
-- TENANTS
-- =====================================================
DROP POLICY IF EXISTS "Tenants are viewable by their members" ON public.tenants;
CREATE POLICY "Tenants are viewable by their members"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- RESTAURANT_TABLES
-- =====================================================
DROP POLICY IF EXISTS "Tables are viewable by tenant members" ON public.restaurant_tables;
CREATE POLICY "Tables are viewable by tenant members"
  ON public.restaurant_tables FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can update table status" ON public.restaurant_tables;
CREATE POLICY "Staff can update table status"
  ON public.restaurant_tables FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can insert tables" ON public.restaurant_tables;
CREATE POLICY "Admins can insert tables"
  ON public.restaurant_tables FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = restaurant_tables.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "Admins can delete tables" ON public.restaurant_tables;
CREATE POLICY "Admins can delete tables"
  ON public.restaurant_tables FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = restaurant_tables.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- CATEGORIES
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant categories" ON public.categories;
CREATE POLICY "Users can view own tenant categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage categories" ON public.categories;
CREATE POLICY "Owners and managers can manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = categories.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = categories.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- PRODUCTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant products" ON public.products;
CREATE POLICY "Users can view own tenant products"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage products" ON public.products;
CREATE POLICY "Owners and managers can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = products.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = products.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- CUSTOMERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant customers" ON public.customers;
CREATE POLICY "Users can view own tenant customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage customers" ON public.customers;
CREATE POLICY "Owners and managers can manage customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = customers.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = customers.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- ORDERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant orders" ON public.orders;
CREATE POLICY "Users can view own tenant orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
CREATE POLICY "Authenticated users can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update own tenant orders" ON public.orders;
CREATE POLICY "Authenticated users can update own tenant orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- CUSTOMER_TRANSACTIONS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant customer transactions" ON public.customer_transactions;
CREATE POLICY "Users can view own tenant customer transactions"
  ON public.customer_transactions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create customer transactions" ON public.customer_transactions;
CREATE POLICY "Authenticated users can create customer transactions"
  ON public.customer_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- ORDER_ITEMS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant order items" ON public.order_items;
CREATE POLICY "Users can view own tenant order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can manage order items" ON public.order_items;
CREATE POLICY "Authenticated users can manage order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- CASH_REGISTERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant cash registers" ON public.cash_registers;
CREATE POLICY "Users can view own tenant cash registers"
  ON public.cash_registers FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage cash registers" ON public.cash_registers;
CREATE POLICY "Owners and managers can manage cash registers"
  ON public.cash_registers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = cash_registers.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = cash_registers.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- CASH_MOVEMENTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant cash movements" ON public.cash_movements;
CREATE POLICY "Users can view own tenant cash movements"
  ON public.cash_movements FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create cash movements" ON public.cash_movements;
CREATE POLICY "Authenticated users can create cash movements"
  ON public.cash_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- EXPENSES
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant expenses" ON public.expenses;
CREATE POLICY "Users can view own tenant expenses"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage expenses" ON public.expenses;
CREATE POLICY "Owners and managers can manage expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = expenses.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = expenses.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- PAYMENT_TRANSACTIONS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own tenant payment transactions"
  ON public.payment_transactions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can create payment transactions"
  ON public.payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own tenant payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can update own tenant payment transactions"
  ON public.payment_transactions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete own tenant payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can delete own tenant payment transactions"
  ON public.payment_transactions FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- CASH_REGISTER_TRANSACTIONS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can view own tenant cash register transactions"
  ON public.cash_register_transactions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can create cash register transactions"
  ON public.cash_register_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own tenant cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can update own tenant cash register transactions"
  ON public.cash_register_transactions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete own tenant cash register transactions" ON public.cash_register_transactions;
CREATE POLICY "Users can delete own tenant cash register transactions"
  ON public.cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- ROLES
-- =====================================================
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.roles;
CREATE POLICY "Users can view roles in their tenant"
  ON public.roles FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can insert roles" ON public.roles;
CREATE POLICY "Admins can insert roles"
  ON public.roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = roles.tenant_id
      AND r.name = 'owner'
    )
  );

DROP POLICY IF EXISTS "Admins can update roles" ON public.roles;
CREATE POLICY "Admins can update roles"
  ON public.roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = roles.tenant_id
      AND r.name = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = roles.tenant_id
      AND r.name = 'owner'
    )
  );

DROP POLICY IF EXISTS "Admins can delete roles" ON public.roles;
CREATE POLICY "Admins can delete roles"
  ON public.roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = roles.tenant_id
      AND r.name = 'owner'
    )
  );

-- =====================================================
-- PROFILES
-- =====================================================
DROP POLICY IF EXISTS "Enable update for own profile" ON public.profiles;
CREATE POLICY "Enable update for own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Enable delete for own profile" ON public.profiles;
CREATE POLICY "Enable delete for own profile"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.profiles;
CREATE POLICY "Enable insert for authenticated users"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid()) AND 
    tenant_id IS NOT NULL
  );

-- =====================================================
-- PRODUCT_VARIANTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view variants in their tenant" ON public.product_variants;
CREATE POLICY "Users can view variants in their tenant"
  ON public.product_variants FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users with product permission can insert variants" ON public.product_variants;
CREATE POLICY "Users with product permission can insert variants"
  ON public.product_variants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = product_variants.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "Users with product permission can update variants" ON public.product_variants;
CREATE POLICY "Users with product permission can update variants"
  ON public.product_variants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = product_variants.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = product_variants.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "Users with product permission can delete variants" ON public.product_variants;
CREATE POLICY "Users with product permission can delete variants"
  ON public.product_variants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = product_variants.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- ONLINE_ORDER_PLATFORMS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant platforms" ON public.online_order_platforms;
CREATE POLICY "Users can view own tenant platforms"
  ON public.online_order_platforms FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can manage platforms" ON public.online_order_platforms;
CREATE POLICY "Admins can manage platforms"
  ON public.online_order_platforms FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = online_order_platforms.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = online_order_platforms.tenant_id
      AND r.name IN ('owner', 'manager')
    )
  );

-- =====================================================
-- ONLINE_ORDERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant orders" ON public.online_orders;
CREATE POLICY "Users can view own tenant orders"
  ON public.online_orders FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update orders" ON public.online_orders;
CREATE POLICY "Users can update orders"
  ON public.online_orders FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create orders" ON public.online_orders;
CREATE POLICY "Users can create orders"
  ON public.online_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- ONLINE_ORDER_ITEMS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own tenant order items" ON public.online_order_items;
CREATE POLICY "Users can view own tenant order items"
  ON public.online_order_items FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage order items" ON public.online_order_items;
CREATE POLICY "Users can manage order items"
  ON public.online_order_items FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- TERMINALS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own terminals" ON public.terminals;
CREATE POLICY "Users can view own terminals"
  ON public.terminals FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own terminals" ON public.terminals;
CREATE POLICY "Users can insert own terminals"
  ON public.terminals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own terminals" ON public.terminals;
CREATE POLICY "Users can update own terminals"
  ON public.terminals FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own terminals" ON public.terminals;
CREATE POLICY "Users can delete own terminals"
  ON public.terminals FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- COMMANDS
-- =====================================================
DROP POLICY IF EXISTS "Users can view commands of own terminals" ON public.commands;
CREATE POLICY "Users can view commands of own terminals"
  ON public.commands FOR SELECT
  TO authenticated
  USING (
    terminal_id IN (
      SELECT id FROM public.terminals WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert commands to own terminals" ON public.commands;
CREATE POLICY "Users can insert commands to own terminals"
  ON public.commands FOR INSERT
  TO authenticated
  WITH CHECK (
    terminal_id IN (
      SELECT id FROM public.terminals WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete commands from own terminals" ON public.commands;
CREATE POLICY "Users can delete commands from own terminals"
  ON public.commands FOR DELETE
  TO authenticated
  USING (
    terminal_id IN (
      SELECT id FROM public.terminals WHERE user_id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- TABLE_GROUPS - Fix overly permissive policies
-- =====================================================
DROP POLICY IF EXISTS "Users can view table groups" ON public.table_groups;
CREATE POLICY "Users can view table groups"
  ON public.table_groups FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create table groups" ON public.table_groups;
CREATE POLICY "Users can create table groups"
  ON public.table_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update table groups" ON public.table_groups;
CREATE POLICY "Users can update table groups"
  ON public.table_groups FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete table groups" ON public.table_groups;
CREATE POLICY "Users can delete table groups"
  ON public.table_groups FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );
