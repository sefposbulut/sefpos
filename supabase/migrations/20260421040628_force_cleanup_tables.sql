/*
  # Force cleanup with cascade
*/

DO $$ 
DECLARE
  v_tenant_id UUID;
  v_branch_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE email = 'alper-karaaslan@hotmail.com.tr' LIMIT 1;
  
  -- Force delete tables and related orders/items
  DELETE FROM order_items 
  WHERE order_id IN (
    SELECT id FROM orders WHERE table_id IN (
      SELECT id FROM restaurant_tables WHERE tenant_id = v_tenant_id
    )
  );
  
  DELETE FROM orders 
  WHERE table_id IN (
    SELECT id FROM restaurant_tables WHERE tenant_id = v_tenant_id
  );
  
  DELETE FROM restaurant_tables WHERE tenant_id = v_tenant_id;
  DELETE FROM table_groups WHERE tenant_id = v_tenant_id;
END $$;
