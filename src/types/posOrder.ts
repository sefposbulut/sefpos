import type { Database } from '../lib/supabase';

export type Product = Database['public']['Tables']['products']['Row'];

/** Varyant (Database şemasında tablo eksik olabilir; POS’ta kullanılan alanlar) */
export interface ProductVariant {
  id: string;
  product_id?: string;
  name: string;
  price_modifier: number;
  sort_order?: number;
  is_active?: boolean;
}

/** Sepet satırı (henüz siparişe yazılmamış) */
export interface CartItem {
  id?: string;
  product: Product;
  quantity: number;
  variant?: ProductVariant;
  notes?: string;
  weight?: number;
  weightedPrice?: number;
}
