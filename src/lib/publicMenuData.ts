import { getVdsApiOrigin } from './sqlDb';

/** QR menü VDS `/public-menu` üzerinden okunur. Oturum jetonu gönderilmez. */

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

export async function loadPublicMenu(branchId: string): Promise<PublicMenuData> {
  const origin = getVdsApiOrigin();
  const res = await fetch(
    `${origin}/vds-api/public-menu?branchId=${encodeURIComponent(branchId)}`,
    { credentials: origin ? 'omit' : 'same-origin' },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error || !data?.branch || !data?.tenant) {
    throw new PublicMenuError('NOT_FOUND', data?.error || 'Menü yüklenemedi');
  }
  const products: PublicProduct[] = (data.products || []).map((p: any) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price: Number(p.price) || 0,
    image_url: p.image_url,
    variants: Array.isArray(p.variants) ? p.variants : [],
  }));
  return {
    tenant: { ...data.tenant, menu_theme: data.menu_theme || null },
    branch: data.branch,
    categories: data.categories || [],
    products,
  };
}

export function buildMenuUrl(branchId: string, origin?: string, tableHint?: string): string {
  const base = (origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const hint = (tableHint || '').trim();
  const q = new URLSearchParams({ menu: branchId });
  if (hint) q.set('masa', hint);
  return `${base}/?${q.toString()}`;
}

export function buildQrMenuPlaceholderImageUrl(productName: string, shortDescription?: string | null): string {
  const name = (productName || 'Yemek').slice(0, 80).replace(/["<>]/g, '');
  const desc = (shortDescription || '').slice(0, 80).replace(/["<>]/g, '');
  const prompt = [
    'Professional appetizing restaurant food photograph',
    name,
    desc ? `, ${desc}` : '',
    ', on ceramic plate, shallow depth of field, warm lighting, no text, no letters, no watermark',
  ].join('');
  const seed = String(name.split('').reduce((a, ch) => ((a << 5) - a + ch.charCodeAt(0)) | 0, 7));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=640&height=400&nologo=true&seed=${encodeURIComponent(seed)}`;
}

export function isQrMenuAiPlaceholderEnabled(): boolean {
  const v = String(import.meta.env.VITE_QR_MENU_AI_PLACEHOLDER_IMAGES ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

export async function createWaiterCall(input: {
  tenantId: string;
  branchId: string;
  tableLabel: string;
  callType: 'service' | 'bill' | 'water' | 'help';
  message?: string;
}): Promise<void> {
  const origin = getVdsApiOrigin();
  const res = await fetch(`${origin}/vds-api/public-waiter-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: origin ? 'omit' : 'same-origin',
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const msg = String(data?.error || 'Garson çağrısı gönderilemedi');
    if (/cok hizli|spam/i.test(msg)) {
      throw new Error('Çok hızlı peşi sıra çağırdınız. Lütfen birkaç saniye bekleyip tekrar deneyin.');
    }
    throw new Error(msg);
  }
}
