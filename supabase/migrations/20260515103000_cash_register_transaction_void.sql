/*
  # Kasa işlemi iptali (audit)

  - `voided_at` dolu satırlar kasa özetinde ve vardiya/gün sonu toplamlarında
    **dikkate alınmaz** (uygulama tarafında `.is('voided_at', null)` veya filtre).
  - Satır silinmez; `void_reason` + `voided_by` ile kayıt tutulur.
  - Authenticated kullanıcıların doğrudan DELETE ile satır silmesi kapatılır;
    iptal yalnızca UPDATE (void) ile yapılır.
*/

ALTER TABLE public.cash_register_transactions
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN public.cash_register_transactions.voided_at IS 'Doluysa işlem kasa özetinde iptal sayılır; satır silinmez.';
COMMENT ON COLUMN public.cash_register_transactions.void_reason IS 'İptal / düzeltme gerekçesi (zorunlu).';
COMMENT ON COLUMN public.cash_register_transactions.voided_by IS 'İptali kaydeden profil (profiles.id = auth.uid()).';

CREATE INDEX IF NOT EXISTS idx_cash_register_voided_at
  ON public.cash_register_transactions (tenant_id, voided_at)
  WHERE voided_at IS NOT NULL;

DROP POLICY IF EXISTS "Users can delete own tenant cash register transactions" ON public.cash_register_transactions;
