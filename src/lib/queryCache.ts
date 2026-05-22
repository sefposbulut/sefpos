import { supabase } from './supabase';
import { isSqlServerMode } from './sqlDb';

interface CacheEntry<T> {
  data: T[];
  timestamp: number;
  tenantId: string;
  branchId?: string;
}

const CACHE_TTL = {
  PRODUCTS: 60 * 60 * 1000,
  CATEGORIES: 60 * 60 * 1000,
  PRODUCT_VARIANTS: 60 * 60 * 1000,
  TABLE_GROUPS: 30 * 60 * 1000,
  TABLES: 10 * 60 * 1000,
};

/**
 * Bayat veriyi göstermeyi kabul ettiğimiz üst sınır (TTL'in N katı).
 * Kullanıcı asla beklemez; sayı değişmiş olsa bile arka planda yenilenir.
 */
const STALE_MULTIPLIER = 6;

/** Şema/kolon değişince artırın; eski boş menü önbelleğini düşürür */
const MENU_CACHE_SCHEMA_VER = 'v3';

/** IndexedDB store ismi → CacheEntry. Tarayıcı yenilemesinden sonra cache yaşamaya devam eder. */
const IDB_STORE = 'queryCache';
const IDB_NAME = 'ShefposCache';
const IDB_VERSION = 2;

interface MenuCachePersisted {
  key: string;
  data: any[];
  timestamp: number;
  tenantId: string;
  schemaVer: string;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private db?: IDBDatabase;
  private dbReady = this.initIndexedDB();
  private hydrated = false;

  private async initIndexedDB() {
    return new Promise<void>((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onerror = () => resolve();
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          // v1 storeları temizliyoruz (doğru kullanılmıyordu)
          for (const name of Array.from(db.objectStoreNames)) {
            try { db.deleteObjectStore(name); } catch { /* ignore */ }
          }
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'key' });
          }
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

  /** İlk paint'ten önce IndexedDB'deki tenant cache'ini belleğe çek (await-suz çağrılabilir). */
  async hydrateForTenant(tenantId: string): Promise<void> {
    await this.dbReady;
    if (!this.db || this.hydrated) return;
    this.hydrated = true;
    try {
      const tx = this.db.transaction(IDB_STORE);
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      await new Promise<void>((resolve) => {
        req.onsuccess = () => {
          const rows = (req.result || []) as MenuCachePersisted[];
          for (const r of rows) {
            if (r.tenantId !== tenantId) continue;
            if (r.schemaVer !== MENU_CACHE_SCHEMA_VER) continue;
            this.cache.set(r.key, { data: r.data, timestamp: r.timestamp, tenantId: r.tenantId });
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    } catch {
      /* ignore */
    }
  }

  private writeIdb(key: string, entry: CacheEntry<any>) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({
        key,
        data: entry.data,
        timestamp: entry.timestamp,
        tenantId: entry.tenantId,
        schemaVer: MENU_CACHE_SCHEMA_VER,
      } as MenuCachePersisted);
    } catch {
      /* quota / inactive transaction */
    }
  }

  private getCacheKey(type: string, tenantId: string, branchId?: string) {
    return `${type}:${tenantId}:${branchId || 'global'}`;
  }

  private getMenuCacheKey(type: 'products' | 'categories' | 'product_variants', tenantId: string) {
    return `${type}:${MENU_CACHE_SCHEMA_VER}:${tenantId}`;
  }

  private isExpired(entry: CacheEntry<any>, ttl: number) {
    return Date.now() - entry.timestamp > ttl;
  }

  private isFreshLike(entry: CacheEntry<any> | undefined, ttl: number, multiplier = 1) {
    return !!entry && Date.now() - entry.timestamp <= ttl * multiplier;
  }

  /**
   * Stale-while-revalidate:
   * - Bellek/IndexedDB'de fresh varsa onu döndür, ağ çağrısı yapma.
   * - Süresi dolmuş ama STALE_MULTIPLIER * TTL altında ise bayat veriyi
   *   anında dön, arka planda yenile (kullanıcı asla beklemez).
   * - Hiçbir şey yoksa veya çok eskiyse beklet.
   */
  async getProductsAndCategories(tenantId: string, _branchId?: string, forceRefresh = false) {
    await this.dbReady;
    if (!this.hydrated) await this.hydrateForTenant(tenantId);

    const prodKey = this.getMenuCacheKey('products', tenantId);
    const catKey = this.getMenuCacheKey('categories', tenantId);
    const varKey = this.getMenuCacheKey('product_variants', tenantId);

    const prodCache = this.cache.get(prodKey);
    const catCache = this.cache.get(catKey);
    const varCache = this.cache.get(varKey);

    const allFresh =
      !forceRefresh &&
      prodCache && !this.isExpired(prodCache, CACHE_TTL.PRODUCTS) &&
      catCache && !this.isExpired(catCache, CACHE_TTL.CATEGORIES) &&
      varCache && !this.isExpired(varCache, CACHE_TTL.PRODUCT_VARIANTS);

    if (allFresh) {
      return {
        products: prodCache!.data,
        categories: catCache!.data,
        productVariants: varCache!.data,
      };
    }

    const allStaleUsable =
      !forceRefresh &&
      this.isFreshLike(prodCache, CACHE_TTL.PRODUCTS, STALE_MULTIPLIER) &&
      this.isFreshLike(catCache, CACHE_TTL.CATEGORIES, STALE_MULTIPLIER) &&
      this.isFreshLike(varCache, CACHE_TTL.PRODUCT_VARIANTS, STALE_MULTIPLIER);

    if (allStaleUsable) {
      void this.fetchAndStoreMenu(tenantId).catch(() => { /* arka plan */ });
      return {
        products: prodCache!.data,
        categories: catCache!.data,
        productVariants: varCache!.data,
      };
    }

    return this.fetchAndStoreMenu(tenantId);
  }

  private fetchAndStoreMenu(tenantId: string) {
    const dedup = `${tenantId}:batch:${MENU_CACHE_SCHEMA_VER}`;
    const existing = this.pendingRequests.get(dedup);
    if (existing) return existing;

    const productCols = isSqlServerMode()
      ? 'id, name, price, cost, category_id, is_active, image_url, barcode, printer_name, unit, stock_quantity, tax_rate, scale_enabled'
      : 'id, name, price, cost, category_id, is_active, image_url, barcode, printer_name, unit, stock_quantity, tax_rate, scale_enabled';
    let productQ = supabase.from('products').select(productCols).eq('tenant_id', tenantId);
    if (isSqlServerMode()) {
      productQ = productQ.eq('is_active', 1);
    } else {
      productQ = productQ.or('is_active.eq.true,is_active.is.null');
    }
    const promise = Promise.all([
      productQ,
      supabase
        .from('categories')
        .select('id, name, color, tenant_id, sort_order')
        .eq('tenant_id', tenantId)
        .order('sort_order'),
      supabase
        .from('product_variants')
        .select('id, tenant_id, product_id, name, price_modifier, sort_order, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order'),
    ]).then(([prodRes, catRes, varRes]) => {
      if (import.meta.env.DEV) {
        if (prodRes.error) console.error('[ŞefPOS] products sorgu hatası:', prodRes.error.message, prodRes.error);
        if (catRes.error) console.error('[ŞefPOS] categories sorgu hatası:', catRes.error.message, catRes.error);
        if (varRes.error) console.error('[ŞefPOS] product_variants sorgu hatası:', varRes.error.message, varRes.error);
      }
      const products = (prodRes.data || []) as any[];
      const categories = (catRes.data || []) as any[];
      const productVariants = (varRes.data || []) as any[];

      const prodKey = this.getMenuCacheKey('products', tenantId);
      const catKey = this.getMenuCacheKey('categories', tenantId);
      const varKey = this.getMenuCacheKey('product_variants', tenantId);
      const now = Date.now();
      const prodEntry: CacheEntry<any> = { data: products, timestamp: now, tenantId };
      const catEntry: CacheEntry<any> = { data: categories, timestamp: now, tenantId };
      const varEntry: CacheEntry<any> = { data: productVariants, timestamp: now, tenantId };
      this.cache.set(prodKey, prodEntry);
      this.cache.set(catKey, catEntry);
      this.cache.set(varKey, varEntry);
      this.writeIdb(prodKey, prodEntry);
      this.writeIdb(catKey, catEntry);
      this.writeIdb(varKey, varEntry);

      return { products, categories, productVariants };
    });

    this.pendingRequests.set(dedup, promise);
    promise.finally(() => this.pendingRequests.delete(dedup));
    return promise;
  }

  /** Synchronous read of in-memory menu cache when fresh — use to paint OrderPanel before network. */
  peekProductsAndCategories(tenantId: string, _branchId?: string): {
    products: any[];
    categories: any[];
    productVariants: any[];
  } | null {
    const prodKey = this.getMenuCacheKey('products', tenantId);
    const catKey = this.getMenuCacheKey('categories', tenantId);
    const varKey = this.getMenuCacheKey('product_variants', tenantId);
    const prodCache = this.cache.get(prodKey);
    const catCache = this.cache.get(catKey);
    const varCache = this.cache.get(varKey);
    // peek bayat veriyi de döndürür — UI ilk karede boyansın
    if (
      this.isFreshLike(prodCache, CACHE_TTL.PRODUCTS, STALE_MULTIPLIER) &&
      this.isFreshLike(catCache, CACHE_TTL.CATEGORIES, STALE_MULTIPLIER) &&
      this.isFreshLike(varCache, CACHE_TTL.PRODUCT_VARIANTS, STALE_MULTIPLIER)
    ) {
      return {
        products: prodCache!.data,
        categories: catCache!.data,
        productVariants: varCache!.data,
      };
    }
    return null;
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
    if (type === 'products' || type === 'categories' || type === 'product_variants') {
      const k = this.getMenuCacheKey(type, tenantId);
      this.cache.delete(k);
      if (this.db) {
        try { this.db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(k); } catch { /* ignore */ }
      }
      return;
    }
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
}

export const queryCache = new QueryCache();
