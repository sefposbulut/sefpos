/*
  print_settings hâlâ schema cache'te 404 veriyor.
  PostgREST'i force reload etmek için tabloya zararsız bir DDL değişikliği
  yapıp NOTIFY tetikliyoruz. COMMENT yenileme PostgREST'in publish queue'sunu
  zorla yeniden tarar.
*/

-- Yardımcı yorumu yeniden yaz → DDL change → cache invalidation tetikler.
COMMENT ON TABLE public.print_settings IS
  'Tenant + branch bazlı yazıcı ayarları. Web/mobil tarafının kasanın yaptığı yazıcı/kategori eşlemelerini görebilmesi için single source of truth.';

-- Sütun yorumu da güncelle → ek DDL noise (cache busting).
COMMENT ON COLUMN public.print_settings.settings IS
  'Yazıcı listesi, kategori-yazıcı eşlemesi, defaultKitchenPrinter vs.';

-- Hem ddl_command_end hem manuel notify
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
