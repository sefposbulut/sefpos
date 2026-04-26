/*
  # Masa Numarası Unique Kısıtlaması Düzeltmesi

  ## Sorun
  restaurant_tables tablosunda UNIQUE(tenant_id, table_number) kısıtlaması vardı.
  Bu yüzden farklı şubelerde aynı masa numarası kullanılamıyordu.

  ## Çözüm
  Kısıtlama UNIQUE(tenant_id, branch_id, table_number) olarak güncellendi.
  Böylece her şubede 1, 2, 3... numaralı masalar ayrı ayrı olabilir.
*/

ALTER TABLE restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_tenant_id_table_number_key;

ALTER TABLE restaurant_tables
  ADD CONSTRAINT restaurant_tables_tenant_branch_table_number_key
  UNIQUE (tenant_id, branch_id, table_number);
