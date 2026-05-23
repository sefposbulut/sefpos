import { supabase } from './supabase';
import { resolveProvinceSlug } from './resellerProvince';

export type PublicDealerPin = {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  province_slug: string;
  license_count: number;
};

type RpcRow = {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  province_slug: string;
  license_count: number | string;
};

function normalizeRow(row: RpcRow): PublicDealerPin | null {
  if (!row.company_name?.trim()) return null;
  const slug =
    resolveProvinceSlug(row.province_slug) ||
    resolveProvinceSlug(row.city) ||
  '';
  return {
    id: row.id,
    company_name: row.company_name.trim(),
    contact_name: row.contact_name?.trim() || '',
    phone: row.phone?.trim() || '',
    email: row.email?.trim() || '',
    city: row.city?.trim() || '',
    province_slug: slug,
    license_count: Number(row.license_count) || 0,
  };
}

/** Lisans panelindeki aktif bayiler — web haritası için. */
export async function fetchPublicDealers(): Promise<PublicDealerPin[]> {
  const rpc = await supabase.rpc('get_public_dealer_map');
  if (!rpc.error && rpc.data?.length) {
    return (rpc.data as RpcRow[]).map(normalizeRow).filter((x): x is PublicDealerPin => !!x);
  }

  const { data, error } = await supabase
    .from('resellers')
    .select('id, company_name, contact_name, phone, email, city, province_slug, notes, status')
    .in('status', ['active', 'approved']);

  if (error || !data) return [];

  return data
    .map((row) =>
      normalizeRow({
        id: row.id,
        company_name: row.company_name,
        contact_name: row.contact_name ?? '',
        phone: row.phone ?? '',
        email: row.email ?? '',
        city: (row as { city?: string }).city ?? (row.notes as string) ?? '',
        province_slug: (row as { province_slug?: string }).province_slug ?? '',
        license_count: 0,
      }),
    )
    .filter((x): x is PublicDealerPin => !!x);
}
