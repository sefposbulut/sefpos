import { supabase } from './supabase';

export const CUSTOMERS_CHANGED_EVENT = 'sefpos-customers-changed';

export function invalidateCustomersListCache(tenantId: string): void {
  try {
    sessionStorage.removeItem(`customers_${tenantId}`);
  } catch {
    /* ignore */
  }
}

export function emitCustomersChanged(tenantId: string): void {
  invalidateCustomersListCache(tenantId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CUSTOMERS_CHANGED_EVENT, { detail: { tenantId } }));
  }
}

const CUSTOMER_LIST_COLS =
  'id, tenant_id, name, phone, email, address, notes, credit_limit, current_balance, is_active, created_at';

export type CustomerListRow = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  created_at: string | null;
  loyalty_points?: number;
};

function isMissingLoyaltyColumn(err: { message?: string; code?: string } | null): boolean {
  const m = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    m.includes('loyalty_points') ||
    (m.includes('column') && (m.includes('does not exist') || m.includes('bulunamad')))
  );
}

/** Cari listesi — loyalty migration uygulanmamış projelerde de çalışır. */
export async function fetchCustomersList(tenantId: string): Promise<{
  data: CustomerListRow[];
  error: { message: string } | null;
}> {
  const withLoyalty = `${CUSTOMER_LIST_COLS}, loyalty_points`;
  let res = await supabase
    .from('customers')
    .select(withLoyalty)
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (res.error && isMissingLoyaltyColumn(res.error)) {
    res = await supabase
      .from('customers')
      .select(CUSTOMER_LIST_COLS)
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    if (!res.error && res.data) {
      return {
        data: (res.data as CustomerListRow[]).map((r) => ({ ...r, loyalty_points: 0 })),
        error: null,
      };
    }
  }

  return {
    data: (res.data || []) as CustomerListRow[],
    error: res.error ? { message: res.error.message || 'Cari hesaplar yüklenemedi.' } : null,
  };
}

function sanitizeIlikePattern(raw: string): string {
  return `%${raw.replace(/%/g, '').replace(/,/g, ' ').trim()}%`;
}

/** Ödeme / sadakat: isim veya telefonla arama (tüm listeyi çekmez). */
export async function searchCustomersForLoyalty(
  tenantId: string,
  raw: string,
  limit = 10,
): Promise<{ data: CustomerListRow[]; error: { message: string } | null }> {
  const q = raw.trim();
  if (q.length < 2) {
    return { data: [], error: null };
  }

  const pattern = sanitizeIlikePattern(q);
  const digits = q.replace(/\D/g, '');
  const phoneFocused = digits.length >= 4 && digits.length / Math.max(q.length, 1) >= 0.5;

  const runQuery = (selectCols: string) => {
    let query = supabase
      .from('customers')
      .select(selectCols)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(limit);

    if (phoneFocused) {
      query = query.ilike('phone', pattern);
    } else {
      query = query.or(`name.ilike.${pattern},phone.ilike.${pattern}`);
    }
    return query;
  };

  const withLoyalty = `${CUSTOMER_LIST_COLS}, loyalty_points`;
  let res = await runQuery(withLoyalty);

  if (res.error && isMissingLoyaltyColumn(res.error)) {
    res = await runQuery(CUSTOMER_LIST_COLS);
    if (!res.error && res.data) {
      return {
        data: (res.data as CustomerListRow[]).map((r) => ({ ...r, loyalty_points: 0 })),
        error: null,
      };
    }
  }

  return {
    data: (res.data || []) as CustomerListRow[],
    error: res.error ? { message: res.error.message || 'Arama başarısız' } : null,
  };
}

/** Hızlı cari — sadakat ödemesinde anında müşteri kartı */
export async function createCustomerQuick(
  tenantId: string,
  input: { name: string; phone?: string | null },
): Promise<{ data: CustomerListRow | null; error: { message: string } | null }> {
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;
  if (!name && !phone) {
    return { data: null, error: { message: 'İsim veya telefon girin' } };
  }

  const displayName = name || `Müşteri ${phone}`;

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: tenantId,
      name: displayName,
      phone,
      is_active: true,
      current_balance: 0,
      credit_limit: 0,
    })
    .select(CUSTOMER_LIST_COLS)
    .single();

  if (error) {
    return { data: null, error: { message: error.message || 'Cari oluşturulamadı' } };
  }

  emitCustomersChanged(tenantId);

  return {
    data: { ...(data as CustomerListRow), loyalty_points: 0 },
    error: null,
  };
}
