-- Bayi haritası: il bilgisi + anonim okuma (web /bayi sayfası)

ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS province_slug text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_resellers_province_slug ON public.resellers(province_slug);

COMMENT ON COLUMN public.resellers.city IS 'İl adı (görüntüleme)';
COMMENT ON COLUMN public.resellers.province_slug IS 'İl slug (turkeyLocations ile eşleşir)';

-- Aktif bayiler + lisans sayısı (hassas alanlar hariç)
CREATE OR REPLACE FUNCTION public.get_public_dealer_map()
RETURNS TABLE (
  id uuid,
  company_name text,
  contact_name text,
  phone text,
  email text,
  city text,
  province_slug text,
  license_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.company_name,
    r.contact_name,
    r.phone,
    r.email,
    COALESCE(NULLIF(trim(r.city), ''), '') AS city,
    COALESCE(NULLIF(trim(r.province_slug), ''), '') AS province_slug,
    COUNT(l.id) FILTER (WHERE l.status = 'active')::bigint AS license_count
  FROM public.resellers r
  LEFT JOIN public.licenses l ON l.reseller_id = r.id
  WHERE r.status IN ('active', 'approved')
  GROUP BY r.id, r.company_name, r.contact_name, r.phone, r.email, r.city, r.province_slug
  ORDER BY r.company_name;
$$;

REVOKE ALL ON FUNCTION public.get_public_dealer_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_dealer_map() TO anon, authenticated;
