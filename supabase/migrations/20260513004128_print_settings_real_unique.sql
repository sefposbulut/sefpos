/*
  # print_settings unique constraint sorununu kalıcı çöz

  ## Problem
  PostgREST `on_conflict=tenant_id,branch_id` kullandığında 400 dönüyor:
    "there is no unique or exclusion constraint matching the ON CONFLICT specification"

  Bunun nedeni mevcut `idx_print_settings_tenant_branch_unique` indexinin
  expression-based (COALESCE) olması. PostgREST yalnızca düz kolon listesi içeren
  unique constraint/index'leri ON CONFLICT için tanıyor.

  ## Çözüm
  PostgreSQL 15+ ile gelen `NULLS NOT DISTINCT` özelliğini kullanarak tek bir
  klasik UNIQUE index yaratıyoruz. Bu sayede:
    - branch_id dolu satırlar (tenant_id, branch_id) ikilisinde tekil olur
    - branch_id NULL olan tenant-wide satır yalnız bir tane olabilir
    - PostgREST `on_conflict=tenant_id,branch_id` ile direkt UPSERT yapabilir

  Eski COALESCE indexini drop ediyoruz. Veri kaybı yok.
*/

DROP INDEX IF EXISTS public.idx_print_settings_tenant_branch_unique;

CREATE UNIQUE INDEX IF NOT EXISTS print_settings_tenant_branch_unique_idx
  ON public.print_settings (tenant_id, branch_id)
  NULLS NOT DISTINCT;

NOTIFY pgrst, 'reload schema';
