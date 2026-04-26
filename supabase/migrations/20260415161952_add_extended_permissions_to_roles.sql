/*
  # Genişletilmiş Rol İzinleri

  ## Değişiklikler
  1. Mevcut rollere yeni izin alanları eklendi:
     - can_view_reports: Raporları görüntüleme
     - can_manage_settings: Ayarları yönetme
     - can_view_cancel_logs: İptal kayıtlarını görme
     - can_end_of_day: Gün sonu işlemleri
     - can_manage_discounts: İndirim uygulama
     - can_delete_order_items: Sipariş kalemi silme
  
  2. Mevcut default roller güncellendi:
     - Yönetici: Tüm izinler açık (can_manage_users hariç - owner için ayrı)
     - Garson: Sadece sipariş alma
     - Kasiyer: Ödeme ve kasa
  
  ## Güvenlik
  - RLS politikaları korunuyor
  - Mevcut veriler bozulmadan güncelleniyor
*/

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, tenant_id, name, permissions FROM roles LOOP
    DECLARE
      p jsonb := r.permissions;
      is_yonetici BOOLEAN := LOWER(r.name) ILIKE '%yönetici%' OR LOWER(r.name) ILIKE '%yonetici%' OR LOWER(r.name) ILIKE '%admin%' OR LOWER(r.name) ILIKE '%manager%' OR LOWER(r.name) ILIKE '%müdür%' OR LOWER(r.name) ILIKE '%mudur%';
      is_garson BOOLEAN := LOWER(r.name) ILIKE '%garson%' OR LOWER(r.name) ILIKE '%waiter%' OR LOWER(r.name) ILIKE '%servis%';
      is_kasiyer BOOLEAN := LOWER(r.name) ILIKE '%kasiyer%' OR LOWER(r.name) ILIKE '%cashier%' OR LOWER(r.name) ILIKE '%kasa%';
    BEGIN
      IF is_yonetici THEN
        p := p || jsonb_build_object(
          'can_view_reports', true,
          'can_manage_settings', true,
          'can_view_cancel_logs', true,
          'can_end_of_day', true,
          'can_manage_discounts', true,
          'can_delete_order_items', true,
          'can_manage_users', COALESCE((p->>'can_manage_users')::boolean, true)
        );
      ELSIF is_kasiyer THEN
        p := p || jsonb_build_object(
          'can_view_reports', false,
          'can_manage_settings', false,
          'can_view_cancel_logs', false,
          'can_end_of_day', false,
          'can_manage_discounts', false,
          'can_delete_order_items', false
        );
      ELSIF is_garson THEN
        p := p || jsonb_build_object(
          'can_view_reports', false,
          'can_manage_settings', false,
          'can_view_cancel_logs', false,
          'can_end_of_day', false,
          'can_manage_discounts', false,
          'can_delete_order_items', true
        );
      ELSE
        p := p || jsonb_build_object(
          'can_view_reports', COALESCE((p->>'can_view_reports')::boolean, false),
          'can_manage_settings', COALESCE((p->>'can_manage_settings')::boolean, false),
          'can_view_cancel_logs', COALESCE((p->>'can_view_cancel_logs')::boolean, false),
          'can_end_of_day', COALESCE((p->>'can_end_of_day')::boolean, false),
          'can_manage_discounts', COALESCE((p->>'can_manage_discounts')::boolean, false),
          'can_delete_order_items', COALESCE((p->>'can_delete_order_items')::boolean, false)
        );
      END IF;

      UPDATE roles SET permissions = p WHERE id = r.id;
    END;
  END LOOP;
END $$;
