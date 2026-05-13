/*
  # log_payment_to_cash_register — doğru sipariş no ve kaynak etiketi

  Tetikleyici daha önce cash_register_transactions.order_number alanına
  v_order.id (UUID) yazıyordu; table_id yokken table_name da boş kalıyordu.
  Hızlı satış (order_type = counter) ve paket/teslimat için okunabilir etiketler.
*/

CREATE OR REPLACE FUNCTION public.log_payment_to_cash_register()
RETURNS TRIGGER AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_table public.restaurant_tables%ROWTYPE;
  v_branch_id uuid;
  v_shift_id uuid;
  v_creator uuid;
  v_table_label text;
  v_order_no text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE id = v_order.table_id;
    v_table_label := 'Masa ' || COALESCE(v_table.table_number::text, '?');
  ELSIF COALESCE(v_order.order_type, '') = 'counter' THEN
    v_table_label := 'Hızlı Satış';
  ELSIF COALESCE(v_order.order_type, '') = 'takeaway' THEN
    v_table_label := 'Paket / Gel-Al';
  ELSIF COALESCE(v_order.order_type, '') = 'delivery' THEN
    v_table_label := 'Teslimat';
  ELSE
    v_table_label := NULL;
  END IF;

  v_order_no := COALESCE(NULLIF(trim(v_order.order_number::text), ''), v_order.id::text);

  v_branch_id := COALESCE(v_order.branch_id, v_table.branch_id);
  v_creator := COALESCE(NEW.created_by, v_order.created_by);

  IF v_branch_id IS NOT NULL AND v_creator IS NOT NULL THEN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE branch_id = v_branch_id
      AND opened_by = v_creator
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  IF v_shift_id IS NULL AND v_branch_id IS NOT NULL THEN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE branch_id = v_branch_id
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.cash_register_transactions (
    tenant_id, transaction_type, payment_method, amount,
    reference_id, reference_type, description, order_number, table_name,
    created_at, created_by, branch_id, shift_id
  ) VALUES (
    NEW.tenant_id, 'order_payment', NEW.payment_method, NEW.amount,
    NEW.id, 'payment_transaction',
    CASE
      WHEN NEW.payment_method = 'cash' THEN 'Nakit Odeme'
      WHEN NEW.payment_method = 'credit_card' THEN 'Kredi Karti Odemesi'
      WHEN NEW.payment_method = 'open_account' THEN 'Acik Hesap Odemesi'
      ELSE 'Odeme'
    END,
    v_order_no,
    v_table_label,
    NEW.created_at, NEW.created_by, v_branch_id, v_shift_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
