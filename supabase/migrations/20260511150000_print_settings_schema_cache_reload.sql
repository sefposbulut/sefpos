/*
  print_settings tablosu PostgREST schema cache'te görünmüyor (404).
  Migration 20260511000000 ile tablo yaratılmış olmasına rağmen REST API
  cache yenilenmemiş. Manuel reload tetikliyoruz.
*/
NOTIFY pgrst, 'reload schema';
