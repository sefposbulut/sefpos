import { supabase } from './supabase';

export type ThemeMode = 'light' | 'dark';
export type FontStyle = 'modern' | 'elegant' | 'casual';
export type HeroStyle = 'gradient' | 'image' | 'solid';

export interface MenuTheme {
  primary?: string;
  accent?: string;
  mode?: ThemeMode;
  fontStyle?: FontStyle;
  heroStyle?: HeroStyle;
  heroImageUrl?: string | null;
  showCategoryImages?: boolean;
}

export interface PublicTenant {
  id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  menu_theme: MenuTheme | null;
}

export interface PublicBranch {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  color: string | null;
  display_order: number | null;
  sort_order: number | null;
  image_url?: string | null;
}

export interface PublicVariant {
  id: string;
  product_id: string;
  name: string;
  price_modifier: number;
  sort_order: number;
}

export interface PublicProduct {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  variants: PublicVariant[];
}

export interface PublicMenuData {
  tenant: PublicTenant;
  branch: PublicBranch;
  categories: PublicCategory[];
  products: PublicProduct[];
}

export class PublicMenuError extends Error {
  code: 'NOT_FOUND' | 'DISABLED' | 'NETWORK';
  constructor(code: 'NOT_FOUND' | 'DISABLED' | 'NETWORK', message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Anonim olarak (oturum açmadan) bir şubenin QR menüsü için gerekli tüm
 * verileri çeker. RLS policy'leri yalnızca aktif + menüde görünür kayıtları döner.
 */
export async function loadPublicMenu(branchId: string): Promise<PublicMenuData> {
  const branchRes = await supabase
    .from('branches')
    .select('id, tenant_id, name, address, phone')
    .eq('id', branchId)
    .maybeSingle();

  if (branchRes.error) {
    throw new PublicMenuError('NETWORK', branchRes.error.message);
  }
  if (!branchRes.data) {
    throw new PublicMenuError('NOT_FOUND', 'Şube bulunamadı veya menü kapalı');
  }

  const branch = branchRes.data as PublicBranch;
  const tenantId = branch.tenant_id;

  const tenantRes = await supabase
    .from('tenants')
    .select('id, name, logo_url, phone, address, menu_theme')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantRes.error || !tenantRes.data) {
    throw new PublicMenuError('NOT_FOUND', 'Restoran bulunamadı');
  }
  const tenant = tenantRes.data as PublicTenant;

  // Kategoriler — image_url kolonu yoksa düşmesin
  let catsRes = await supabase
    .from('categories')
    .select('id, name, color, display_order, sort_order, image_url')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (catsRes.error && /image_url/i.test(catsRes.error.message || '')) {
    catsRes = await supabase
      .from('categories')
      .select('id, name, color, display_order, sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
  }
  const prodsRes = await supabase
    .from('products')
    .select('id, category_id, name, description, price, image_url')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (catsRes.error) throw new PublicMenuError('NETWORK', catsRes.error.message);
  if (prodsRes.error) throw new PublicMenuError('NETWORK', prodsRes.error.message);

  const productIds = (prodsRes.data || []).map((p: { id: string }) => p.id);
  let variants: PublicVariant[] = [];
  if (productIds.length > 0) {
    const variantsRes = await supabase
      .from('product_variants')
      .select('id, product_id, name, price_modifier, sort_order')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true });
    if (variantsRes.error) throw new PublicMenuError('NETWORK', variantsRes.error.message);
    variants = (variantsRes.data || []) as PublicVariant[];
  }

  const variantsByProduct = new Map<string, PublicVariant[]>();
  for (const v of variants) {
    const list = variantsByProduct.get(v.product_id) || [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  const products: PublicProduct[] = (prodsRes.data || []).map((p: any) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price: Number(p.price) || 0,
    image_url: p.image_url,
    variants: variantsByProduct.get(p.id) || [],
  }));

  return {
    tenant,
    branch,
    categories: (catsRes.data || []) as PublicCategory[],
    products,
  };
}

/** URL üretici — ?menu=BRANCH_ID formatında (origin baz alınır). */
export function buildMenuUrl(branchId: string, origin?: string): string {
  const base = (origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return `${base}/?menu=${branchId}`;
}

/**
 * Garson çağırma — anon role INSERT yetkisi ile public.waiter_calls'a yazar.
 * RLS policy şube → tenant tutarlılığını ve menu_enabled'ı doğrular.
 */
export async function createWaiterCall(input: {
  tenantId: string;
  branchId: string;
  tableLabel: string;
  callType: 'service' | 'bill' | 'water' | 'help';
  message?: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('waiter_calls')
    .insert({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      table_label: input.tableLabel.trim().slice(0, 60) || '-',
      call_type: input.callType,
      message: input.message?.trim().slice(0, 280) || null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}
