-- Tenant satış para birimi (Ayarlar → Hesap Bilgileri)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'TRY';

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_currency_code_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_currency_code_check
  CHECK (currency_code IN ('TRY', 'USD', 'EUR'));

COMMENT ON COLUMN public.tenants.currency_code IS 'POS satış para birimi: TRY (varsayılan), USD, EUR';
