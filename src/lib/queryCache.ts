import { supabase, Database } from './supabase';

type Category = Database['public']['Tables']['categories']['Row'];
type Product = Database['public']['Tables']['products']['Row'];
type TableGroup = Database['public']['Tables']['table_groups']['Row'];

interface CacheEntry<T> {
  data: T[];
  timestamp: number;
  tenantId: string;
  branchId?: string;
}

const CACHE_TTL = {
  PRODUCTS: 30 * 60 * 1000, // 30 minutes
  CATEGORIES: 30 * 60 * 1000,
  PRODUCT_VARIANTS: 30 * 60 * 1000,
  TABLE_GROUPS: 15 * 60 * 1000,
  TABLES: 2 * 60 * 1000, // 2 minutes (more frequent changes)
};

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private db?: IDBDatabase;
  private dbReady = this.initIndexedDB();

  private async initIndexedDB() {
    return new Promise<void>((resolve) => {
      try {
        const req = indexedDB.open('ShefposCache', 1);
        req.onerror = () => resolve();
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('products')) db.createObjectStore('products');
          if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories');
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve();
        };
      } catch {
        resolve();
      }
    });
  }

  private getCacheKey(type: string, tenantId: string, branchId?: string) {
    return `${type}:${tenantId}:${branchId || 'global'}`;
  }

  private isExpired(entry: CacheEntry<any>, ttl: number) {
    return Date.now() - entry.timestamp > ttl;
  }

  async getProductsAndCategories(tenantId: string, branchId?: string, forceRefresh = false) {
    await this.dbReady;

    const prodKey = this.getCacheKey('products', tenantId);
    const catKey = this.getCacheKey('categories', tenantId);
    const varKey = this.getCacheKey('product_variants', tenantId);

    const prodCache = this.cache.get(prodKey);
    const catCache = this.cache.get(catKey);
    const varCache = this.cache.get(varKey);

    if (
      !forceRefresh &&
      prodCache && !this.isExpired(prodCache, CACHE_TTL.PRODUCTS) &&
      catCache && !this.isExpired(catCache, CACHE_TTL.CATEGORIES) &&
      varCache && !this.isExpired(varCache, CACHE_TTL.PRODUCT_VARIANTS)
    ) {
      console.log('[QueryCache] Hit - returning cached data');
      return { products: prodCache.data, categories: catCache.data, productVariants: varCache.data };
    }

    console.log('[QueryCache] Miss - fetching from Supabase');

    // Batch fetch from Supabase (3 queries paralel)
    const dedup = `${tenantId}:batch`;
    if (this.pendingRequests.has(dedup)) {
      return this.pendingRequests.get(dedup)!;
    }

    const promise = Promise.all([
      supabase
        .from('products')
        .select('id, name, price, category_id, is_active, image_url, barcode, printer_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      supabase
        .from('categories')
        .select('id, name, color, tenant_id')
        .eq('tenant_id', tenantId)
        .order('sort_order'),
      supabase
        .from('product_variants')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order'),
    ]).then(([prodRes, catRes, varRes]) => {
      const products = (prodRes.data || []) as any[];
      const categories = (catRes.data || []) as any[];
      const productVariants = (varRes.data || []) as any[];

      this.cache.set(prodKey, { data: products, timestamp: Date.now(), tenantId });
      this.cache.set(catKey, { data: categories, timestamp: Date.now(), tenantId });
      this.cache.set(varKey, { data: productVariants, timestamp: Date.now(), tenantId });

      return { products, categories, productVariants };
    });

    this.pendingRequests.set(dedup, promise);
    promise.finally(() => this.pendingRequests.delete(dedup));

    return promise;
  }

  async getTableGroups(tenantId: string, branchId: string, forceRefresh = false) {
    await this.dbReady;
    const key = this.getCacheKey('table_groups', tenantId, branchId);
    const cached = this.cache.get(key);

    if (!forceRefresh && cached && !this.isExpired(cached, CACHE_TTL.TABLE_GROUPS)) {
      return cached.data;
    }

    return supabase
      .from('table_groups')
      .select('id, name, color, branch_id, prefix')
      .eq('tenant_id', tenantId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order('name')
      .then(({ data }) => {
        const groups = data || [];
        this.cache.set(key, { data: groups, timestamp: Date.now(), tenantId });
        return groups;
      });
  }

  invalidate(type: 'products' | 'categories' | 'tables' | 'orders' | 'product_variants', tenantId: string, branchId?: string) {
    const key = this.getCacheKey(type, tenantId, branchId);
    this.cache.delete(key);
  }

  invalidateAll(tenantId: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(tenantId)) {
        this.cache.delete(key);
      }
    }
  }

  private async getFromIndexedDB(storeName: string): Promise<any> {
    if (!this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db!.transaction(storeName);
      const req = tx.objectStore(storeName).get('data');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  private saveToIndexedDB(storeName: string, data: any) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(data, 'data');
    } catch {
      // Quota exceeded or other error
    }
  }
}

export const queryCache = new QueryCache();
