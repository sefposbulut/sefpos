import { supabase } from './supabase';

const DELIVERY_FIELDS =
  'id, tenant_id, branch_id, full_name, phone, address, notes, last_order_at, order_count, created_at';

const CARI_FIELDS = 'id, name, phone, email, address, notes, is_active';

export type DeliveryCustomerHit = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  full_name: string;
  phone: string;
  address: string;
  notes: string;
  last_order_at: string | null;
  order_count: number;
  created_at: string;
};

export type CariCustomerHit = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

export type TakeawayCustomerSuggestion =
  | { kind: 'delivery'; row: DeliveryCustomerHit }
  | { kind: 'cari'; row: CariCustomerHit };

function sanitizePattern(raw: string): string {
  const safe = raw.replace(/%/g, '').replace(/,/g, ' ').trim();
  return `%${safe}%`;
}

/** Tek aramada teslimat + cari (2 sorgu, dar alanlar). */
export async function searchTakeawayCustomers(
  tenantId: string,
  raw: string,
): Promise<TakeawayCustomerSuggestion[]> {
  const q = raw.trim();
  if (q.length < 2) return [];

  const pattern = sanitizePattern(q);

  const [deliveryRes, cariRes] = await Promise.all([
    supabase
      .from('delivery_customers')
      .select(DELIVERY_FIELDS)
      .eq('tenant_id', tenantId)
      .or(`phone.ilike.${pattern},full_name.ilike.${pattern}`)
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from('customers')
      .select(CARI_FIELDS)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .order('name', { ascending: true })
      .limit(12),
  ]);

  const err = deliveryRes.error || cariRes.error;
  if (err) {
    console.warn('[takeawayCustomerSearch]', err.message);
    return [];
  }

  const merged: TakeawayCustomerSuggestion[] = [];
  const seenDel = new Set<string>();
  const seenCari = new Set<string>();

  for (const row of deliveryRes.data || []) {
    const r = row as DeliveryCustomerHit;
    if (seenDel.has(r.id)) continue;
    seenDel.add(r.id);
    merged.push({ kind: 'delivery', row: r });
  }
  for (const row of cariRes.data || []) {
    const r = row as CariCustomerHit;
    if (seenCari.has(r.id)) continue;
    seenCari.add(r.id);
    merged.push({ kind: 'cari', row: r });
  }

  return merged.slice(0, 16);
}
