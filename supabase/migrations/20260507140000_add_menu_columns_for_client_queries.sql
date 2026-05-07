/*
  İstemci (queryCache, Products.tsx) PostgREST ile şu kolonları seçer/insert eder:
  categories.color; products.cost, barcode, unit, stock_quantity, tax_rate
  Bu kolonlar eski şemada yoksa SELECT/INSERT 400 döner ve data boş gelir.
*/
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3B82F6';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost numeric(12, 2) DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'adet';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity numeric(12, 2) DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) DEFAULT 20;
