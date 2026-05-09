/*
  # tenants + branches: city / district kolonlari

  ## Amac
  Onboarding sihirbazi (`OnboardingWizard.tsx` Step 3 - Isletme Bilgileri)
  artik il/ilce secimini zorunlu tutar. Bu kolonlar dolduruldugunda raporlar,
  fatura ve KVKK metinlerinde kullanilabilir.

  ## Degisiklikler
  - `tenants.city` (text)        - Il
  - `tenants.district` (text)    - Ilce
  - `branches.city` (text)       - Sube il
  - `branches.district` (text)   - Sube ilce

  ## Notlar
  - Idempotent (IF NOT EXISTS).
  - Free text — istemci tarafi statik liste (`turkeyCitiesDistricts.ts`)
    uzerinden secim yapar, server bos string yerine NULL yazar.
*/

ALTER TABLE public.tenants  ADD COLUMN IF NOT EXISTS city     text;
ALTER TABLE public.tenants  ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS city     text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS district text;

COMMENT ON COLUMN public.tenants.city      IS 'Sirket merkezi - il (Onboarding/Settings)';
COMMENT ON COLUMN public.tenants.district  IS 'Sirket merkezi - ilce (Onboarding/Settings)';
COMMENT ON COLUMN public.branches.city     IS 'Sube il';
COMMENT ON COLUMN public.branches.district IS 'Sube ilce';

NOTIFY pgrst, 'reload schema';
