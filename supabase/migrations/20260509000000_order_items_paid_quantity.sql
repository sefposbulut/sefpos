-- Sepette ürün-bazlı kısmi ödeme: order_items satırlarına ödeme bilgisi ekle.
-- paid_quantity: o satırın kaç adedinin ödendiği (varsayılan 0).
-- paid_at: satırın tamamen ödendiği an (NULL = henüz ödenmedi).

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS paid_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS order_items_paid_at_idx
  ON public.order_items (order_id) WHERE paid_at IS NOT NULL;

-- PostgREST schema cache yenile
NOTIFY pgrst, 'reload schema';
