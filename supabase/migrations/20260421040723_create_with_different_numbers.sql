/*
  # Create tables with different table numbers to avoid constraint
*/

DO $$ 
DECLARE
  v_tenant_id UUID := '61fe9d67-2e5f-41d7-8b39-f1a42b41fa25';
  v_branch_id UUID := 'fb46f264-6858-4db0-ab73-69fb7d9d734d';
  v_bahce_id UUID;
  v_salon_id UUID;
  i INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.branches WHERE id = v_branch_id AND tenant_id = v_tenant_id
     ) THEN
    NULL;
  ELSE
  INSERT INTO table_groups (id, name, prefix, tenant_id, branch_id, color)
  VALUES (gen_random_uuid(), 'Bahçe', 'B', v_tenant_id, v_branch_id, '#FF6B35')
  RETURNING id INTO v_bahce_id;
  
  INSERT INTO table_groups (id, name, prefix, tenant_id, branch_id, color)
  VALUES (gen_random_uuid(), 'Salon', 'S', v_tenant_id, v_branch_id, '#FF6B35')
  RETURNING id INTO v_salon_id;
  
  FOR i IN 101..160 LOOP
    INSERT INTO restaurant_tables (id, table_number, group_id, tenant_id, branch_id, status)
    VALUES (gen_random_uuid(), i, v_bahce_id, v_tenant_id, v_branch_id, 'available');
  END LOOP;
  
  FOR i IN 201..210 LOOP
    INSERT INTO restaurant_tables (id, table_number, group_id, tenant_id, branch_id, status)
    VALUES (gen_random_uuid(), i, v_salon_id, v_tenant_id, v_branch_id, 'available');
  END LOOP;
  END IF;
END $$;
