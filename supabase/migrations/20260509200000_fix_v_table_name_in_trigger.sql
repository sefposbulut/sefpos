/*
  # log_payment_to_cash_register — v_table.name FIX

  ## Hata
  "record \"v_table\" has no field \"name\"" — restaurant_tables tablosunda
  `name` kolonu yok. Dogru kolon: `table_number`. Eski trigger da
  yanlisti; planpgsql lazy derlerme ile bu satira hic ulasilmadiginda
  fark edilmemisti, ama vardiya guncellemesinden sonra trigger her
  payment'ta derlenip calisinca hata yaydi.

  ## Cozum
  v_table.name -> v_table.table_number (text). Ayrica null-safe.
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
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE id = v_order.table_id;
    v_table_label := COALESCE(v_table.table_number, '');
  END IF;

  v_branch_id := COALESCE(v_order.branch_id, v_table.branch_id);
  v_creator := COALESCE(NEW.created_by, v_order.created_by);

  -- 1) ONCE: payment'i yapan kullanicinin acik vardiyasi
  IF v_branch_id IS NOT NULL AND v_creator IS NOT NULL THEN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE branch_id = v_branch_id
      AND opened_by = v_creator
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  -- 2) Bulamadiysak: branch'in herhangi acik vardiyasi (sequential mod / fallback)
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
    v_order.id::text, v_table_label,
    NEW.created_at, NEW.created_by, v_branch_id, v_shift_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
