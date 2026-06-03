import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sqlDb, localDb, isSqlServerMode, isLocalMode } from './sqlDb';
import { installSupabaseDiagnostics, recordHttpRequest } from './resourceDiagnostics';

const isElectronRuntime = !!(window as any).electronAPI;
const runtimeDbUrl = localStorage.getItem('shefpos_db_url');
const runtimeDbAnonKey = localStorage.getItem('shefpos_db_anon_key');

const portOverrideUrl =
  typeof __SEFPOS_DEV_PORT_OVERRIDE_URL__ === 'string' ? __SEFPOS_DEV_PORT_OVERRIDE_URL__.trim() : '';
const portOverrideAnon =
  typeof __SEFPOS_DEV_PORT_OVERRIDE_ANON__ === 'string' ? __SEFPOS_DEV_PORT_OVERRIDE_ANON__.trim() : '';

const envUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const envAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const devUrl = typeof __SEFPOS_DEV_SUPABASE_URL__ === 'string' ? __SEFPOS_DEV_SUPABASE_URL__.trim() : '';
const devAnon = typeof __SEFPOS_DEV_SUPABASE_ANON_KEY__ === 'string' ? __SEFPOS_DEV_SUPABASE_ANON_KEY__.trim() : '';

const DEFAULT_SUPABASE_URL = 'https://xdfnozfuuzctubijbnds.supabase.co';
/**
 * Publishable anon key — RLS sayesinde "public" sayilir, herhangi bir gizlilik
 * hassasiyeti yok. Production build'de `.env` yoksa (orn. GitHub Actions
 * runner) fallback olarak kullanilir, boylece `supabaseKey is required`
 * crash'i yasanmaz. Electron main.cjs icindeki FALLBACK_PRIMARY_SUPABASE_ANON_KEY
 * ile ayni. Geliştirme/lokal build'lerde .env veya sefpos-dev-port.json
 * onceliklidir; bu sadece son fallback.
 */
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_wrSHY5Kzkw-bx0XzYM5VFA_FK3BFF_x';

const supabaseUrl = portOverrideUrl || envUrl || devUrl || runtimeDbUrl || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = portOverrideAnon || envAnon || devAnon || runtimeDbAnonKey || DEFAULT_SUPABASE_ANON_KEY;

if (import.meta.env.DEV && portOverrideUrl) {
  try {
    console.info('[ŞefPOS] Supabase (port-json override):', new URL(supabaseUrl).host);
  } catch {
    console.info('[ŞefPOS] Supabase (port-json override):', supabaseUrl);
  }
}

if (import.meta.env.DEV && !envUrl && !runtimeDbUrl && devUrl) {
  console.info('[ŞefPOS] Supabase URL: .env yok → sefpos-dev-port.json / Vite yedek:', devUrl);
}
if (import.meta.env.DEV && supabaseUrl && !supabaseAnonKey) {
  console.error(
    '[ŞefPOS] VITE_SUPABASE_ANON_KEY veya sefpos-dev-port.json → supabaseDevAnonKey gerekli (URL ile aynı projeden).',
  );
}
if (import.meta.env.DEV && !portOverrideUrl && !envUrl && !runtimeDbUrl && !devUrl) {
  console.warn('[ŞefPOS] VITE_SUPABASE_URL tanımlı değil; birincil proje URL’si kullanılıyor.');
}

const edgeFunctionsBaseUrl = `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1`;

/** Yerel `npm run dev`: tarayıcıdan doğrudan *.supabase.co → CORS / OPTIONS hatası. Vite `/__supabase-functions` proxy aynı origin. */
function edgeFunctionInvokeUrl(functionName: string): string {
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    /^https?:\/\//i.test(String(window.location?.protocol || ''))
  ) {
    const base = String(window.location.origin || '').replace(/\/$/, '');
    if (base) return `${base}/__supabase-functions/${functionName}`;
  }
  return `${edgeFunctionsBaseUrl}/${functionName}`;
}

/** Edge Function çağrıları için tam URL (dev'de Vite proxy, prod'da *.supabase.co). */
export function getEdgeFunctionInvokeUrl(functionName: string): string {
  return edgeFunctionInvokeUrl(functionName);
}

/** `apikey` header — createClient ile aynı çözümlü anahtar. */
export function getResolvedSupabaseAnonKey(): string {
  return supabaseAnonKey;
}

const nativeFetch = globalThis.fetch.bind(globalThis);

/**
 * Konsolda gördüğünüz:
 * - Host `….supabase.co` = Supabase **proje** adresi (ref hostname’de).
 * - `tenant_id=eq.<uuid>` / `branch_id=eq.<uuid>` = uygulama **kiracı / şube** satır id’leri (demo migration’daki sabitler), proje ref’i değil.
 */
const REST_BRANCH_PRODUCT_STOCKS = '/rest/v1/branch_product_stocks';

function devBranchProductStocksAbsentSessionKey(): string {
  try {
    return `sefpos_dev_branch_product_stocks_absent:${new URL(supabaseUrl).host}`;
  } catch {
    return 'sefpos_dev_branch_product_stocks_absent';
  }
}

/** Bellek + sessionStorage: F5 ile yenileyince de tablo yok bilgisi korunur (gereksiz GET 404 tekrarlanmaz). */
let devBranchProductStocksTableInMemoryMissing = false;

function isDevBranchProductStocksKnownMissing(): boolean {
  if (!import.meta.env.DEV) return false;
  if (devBranchProductStocksTableInMemoryMissing) return true;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(devBranchProductStocksAbsentSessionKey()) === '1') {
      devBranchProductStocksTableInMemoryMissing = true;
      return true;
    }
  } catch {
    /* private mode */
  }
  return false;
}

function rememberDevBranchProductStocksTableMissing(): void {
  devBranchProductStocksTableInMemoryMissing = true;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(devBranchProductStocksAbsentSessionKey(), '1');
  } catch {
    /* quota */
  }
}

function clearDevBranchProductStocksTableMissing(): void {
  devBranchProductStocksTableInMemoryMissing = false;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(devBranchProductStocksAbsentSessionKey());
  } catch {
    /* ignore */
  }
}

function sefposRequestHref(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

function sefposRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method || (typeof input !== 'string' && input instanceof Request ? input.method : undefined);
  return String(m || 'GET').toUpperCase();
}

/** Legacy anon (eyJ… üç parça). sb_publishable_* Bearer olarak gönderilmez (platform 401). */
function isLegacyJwtAnonKey(k: string): boolean {
  const s = String(k || '').trim();
  return s.startsWith('eyJ') && s.split('.').length === 3;
}

/** Edge Function — URL ve anahtar, üstteki createClient ile aynı (VITE_* / localStorage). */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };
  if (isLegacyJwtAnonKey(supabaseAnonKey)) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
  }
  const body = JSON.stringify(payload);
  const res = await fetch(edgeFunctionInvokeUrl(functionName), { method: 'POST', headers, body });
  const rawText = await res.text();
  let data: unknown = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }
  const respBody = data as { success?: boolean; error?: string; code?: string; message?: string } | null;
  const notFound =
    res.status === 404 ||
    respBody?.code === 'NOT_FOUND' ||
    (typeof respBody?.message === 'string' && respBody.message.includes('not found'));
  if (notFound) {
    throw new Error(
      `Edge fonksiyon "${functionName}" bu Supabase projesinde yayında değil (404). ` +
        `Dashboard → Edge Functions kontrol veya: npx supabase login && ` +
        `npx supabase functions deploy ${functionName} --project-ref <proje-ref>`,
    );
  }
  if (!res.ok || respBody?.success === false) {
    throw new Error(
      respBody?.error ||
        respBody?.message ||
        (rawText && rawText.length < 400 ? rawText : `${functionName} başarısız (${res.status})`),
    );
  }
  return data as T;
}

/**
 * GoTrue `grant_type=refresh_token` 400 (invalid / missing refresh) durumunda
 * istemci bozuk oturumu tekrar tekrar yenilemeye çalışır; PostgREST ve
 * `print_jobs` RLS 401 ile düşer. Yerel oturumu temizleyip login ekranına
 * dönmek için `signOut({ scope: 'local' })` (microtask ile, fetch içi
 * yeniden girişi önlemek için).
 */
const sefposAuthClientBox: { client: SupabaseClient<Database> | null } = { client: null };

async function clearInvalidRefreshSessionIfNeeded(href: string, res: Response): Promise<void> {
  if (!href.includes('/auth/v1/token') || res.status !== 400) return;
  let body = '';
  try {
    body = (await res.clone().text()).toLowerCase();
  } catch {
    return;
  }
  const invalid =
    body.includes('invalid_refresh_token') ||
    body.includes('invalid refresh token') ||
    body.includes('refresh token not found') ||
    body.includes('refresh_token_not_found');
  if (!invalid) return;
  const client = sefposAuthClientBox.client;
  if (!client) return;
  queueMicrotask(() => {
    void (async () => {
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        try {
          await client.auth.signOut();
        } catch {
          /* ignore */
        }
      }
    })();
  });
}

const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: (input, init) => {
      if (isSqlServerMode() || isLocalMode()) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      const href = sefposRequestHref(input);
      const method = sefposRequestMethod(input, init);
      if (
        import.meta.env.DEV &&
        isDevBranchProductStocksKnownMissing() &&
        href.includes(REST_BRANCH_PRODUCT_STOCKS) &&
        method === 'GET'
      ) {
        const body = JSON.stringify({
          code: 'PGRST205',
          details: null,
          hint: null,
          message: "Could not find the table 'public.branch_product_stocks' in the schema cache",
        });
        return Promise.resolve(
          new Response(body, {
            status: 404,
            statusText: 'Not Found',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }),
        );
      }
      // Offline / yavas baglantida her isteyi sonsuza kadar bekletmemek icin
      // belirli timeout uygula (auth ve realtime haric, onlar tarayici default
      // davranisinda kalsin). Boylece tarayici "donmus" gibi gozukmez; kullanici
      // cache/snapshot uzerinden cogu UI'i gorur.
      const isAuth = href.includes('/auth/v1/');
      const isAuthToken = href.includes('/auth/v1/token');
      const isRealtime = href.includes('/realtime/');
      if (!isRealtime) recordHttpRequest(href, method);
      const fetchOptions: RequestInit = init ? { ...(init as RequestInit) } : {};

      // Auth: refresh_token (`/auth/v1/token`) yarım kesilirse istemci bazen oturumu
      // düşürüyor; bu yüzden token isteğinde Abort kullanmıyoruz. Diğer auth uçları
      // için uzun ama sınırlı timeout (eski 10 sn çok agresifti → yanlış çıkış).
      if (isAuth && !isAuthToken && typeof AbortController !== 'undefined' && !fetchOptions.signal) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        fetchOptions.signal = controller.signal;
        return nativeFetch(input as RequestInfo, fetchOptions)
          .then(async (res) => {
            await clearInvalidRefreshSessionIfNeeded(href, res);
            return res;
          })
          .finally(() => clearTimeout(timer));
      }

      if (!isAuth && !isRealtime && typeof AbortController !== 'undefined' && !fetchOptions.signal) {
        const controller = new AbortController();
        const timeoutMs = navigator.onLine === false ? 1500 : 12000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        fetchOptions.signal = controller.signal;
        return nativeFetch(input as RequestInfo, fetchOptions)
          .finally(() => clearTimeout(timer))
          .then(async (res) => {
            if (import.meta.env.DEV && method === 'GET' && href.includes(REST_BRANCH_PRODUCT_STOCKS)) {
              if (res.ok && res.status >= 200 && res.status < 300) {
                clearDevBranchProductStocksTableMissing();
              } else if (res.status === 404) {
                rememberDevBranchProductStocksTableMissing();
              }
            }
            return res;
          })
          .catch((err) => {
            // Offline veya timeout: bos 200 cevap don ki UI cache'e dussun ve
            // PostgREST hatasi gibi gosterilmesin. Mutasyonlar (POST/PUT/PATCH/
            // DELETE) icin gercek hatayi devret.
            const isReadOnly = !method || method === 'GET' || method === 'HEAD';
            if (isReadOnly) {
              if (import.meta.env.DEV) {
                console.warn('[ŞefPOS] Network bekleme aşıldı, cache kullanılacak:', href, err?.message);
              }
              return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            throw err;
          });
      }
      return nativeFetch(input as RequestInfo, init as RequestInit | undefined).then(async (res) => {
        await clearInvalidRefreshSessionIfNeeded(href, res);
        if (import.meta.env.DEV && href.includes('/auth/v1/') && !res.ok) {
          try {
            const snippet = (await res.clone().text()).slice(0, 900);
            const log = res.status >= 500 ? console.error : console.warn;
            log('[ŞefPOS] Supabase Auth HTTP', res.status, href, snippet || '(gövde boş)');
          } catch {
            /* ignore */
          }
        }
        if (import.meta.env.DEV && method === 'GET' && href.includes(REST_BRANCH_PRODUCT_STOCKS)) {
          if (res.ok && res.status >= 200 && res.status < 300) {
            clearDevBranchProductStocksTableMissing();
          } else if (res.status === 404) {
            rememberDevBranchProductStocksTableMissing();
          }
        }
        return res;
      });
    },
  },
});

sefposAuthClientBox.client = realSupabase;

if (typeof window !== 'undefined') {
  installSupabaseDiagnostics(realSupabase);
}

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    if (isLocalMode()) {
      return (localDb as any)[prop];
    }
    if (isSqlServerMode()) {
      return (sqlDb as any)[prop];
    }
    return (realSupabase as any)[prop];
  },
});

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          logo_url: string | null;
          subscription_status: string;
          subscription_plan: string | null;
          subscription_expires_at: string | null;
          max_branches: number | null;
          notes: string | null;
          onboarding_completed: boolean | null;
          created_at: string;
          printer_settings: any;
          require_cancel_reason: boolean | null;
          lock_pin: string | null;
          ip_lock_enabled: boolean | null;
          deployment_mode: string | null;
          disabled_modules: string[] | null;
          currency_code: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          subscription_status?: string;
          subscription_plan?: string | null;
          subscription_expires_at?: string | null;
          max_branches?: number | null;
          notes?: string | null;
          onboarding_completed?: boolean | null;
          created_at?: string;
          printer_settings?: any;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          subscription_status?: string;
          subscription_plan?: string | null;
          subscription_expires_at?: string | null;
          max_branches?: number | null;
          notes?: string | null;
          onboarding_completed?: boolean | null;
          created_at?: string;
          printer_settings?: any;
          require_cancel_reason?: boolean | null;
          lock_pin?: string | null;
          currency_code?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          role: 'owner' | 'admin' | 'manager' | 'waiter' | 'kitchen' | 'cashier';
          role_id: string | null;
          avatar_url: string | null;
          branch_id: string | null;
          is_super_admin: boolean | null;
          onboarding_completed: boolean | null;
          allowed_ips: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          role?: 'owner' | 'admin' | 'manager' | 'waiter' | 'kitchen' | 'cashier';
          role_id?: string | null;
          avatar_url?: string | null;
          branch_id?: string | null;
          is_super_admin?: boolean | null;
          onboarding_completed?: boolean | null;
          allowed_ips?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string;
          full_name?: string;
          role?: 'owner' | 'admin' | 'manager' | 'waiter' | 'kitchen' | 'cashier';
          role_id?: string | null;
          avatar_url?: string | null;
          branch_id?: string | null;
          is_super_admin?: boolean | null;
          onboarding_completed?: boolean | null;
          allowed_ips?: string | null;
          created_at?: string;
        };
      };
      roles: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          permissions: {
            can_view_tables: boolean;
            can_take_orders: boolean;
            can_process_payments: boolean;
            can_manage_products: boolean;
            can_manage_users: boolean;
            can_view_reports: boolean;
            can_manage_cash_register: boolean;
          };
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          permissions?: {
            can_view_tables?: boolean;
            can_take_orders?: boolean;
            can_process_payments?: boolean;
            can_manage_products?: boolean;
            can_manage_users?: boolean;
            can_view_reports?: boolean;
            can_manage_cash_register?: boolean;
          };
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          permissions?: {
            can_view_tables?: boolean;
            can_take_orders?: boolean;
            can_process_payments?: boolean;
            can_manage_products?: boolean;
            can_manage_users?: boolean;
            can_view_reports?: boolean;
            can_manage_cash_register?: boolean;
          };
          created_at?: string;
        };
      };
      table_groups: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          prefix: string | null;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          prefix?: string | null;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          prefix?: string | null;
          color?: string;
          created_at?: string;
        };
      };
      restaurant_tables: {
        Row: {
          id: string;
          tenant_id: string;
          table_number: string;
          capacity: number;
          status: 'available' | 'occupied' | 'reserved';
          current_order_id: string | null;
          group_id: string | null;
          session_start: string | null;
          branch_id: string | null;
          size: string | null;
          payment_locked: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          table_number: string;
          capacity?: number;
          status?: 'available' | 'occupied' | 'reserved';
          current_order_id?: string | null;
          group_id?: string | null;
          session_start?: string | null;
          branch_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          table_number?: string;
          capacity?: number;
          status?: 'available' | 'occupied' | 'reserved';
          current_order_id?: string | null;
          group_id?: string | null;
          session_start?: string | null;
          branch_id?: string | null;
          size?: string | null;
          payment_locked?: boolean | null;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          display_order: number;
          color: string | null;
          sort_order: number | null;
          hugin_vat_department: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          display_order?: number;
          color?: string | null;
          sort_order?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          display_order?: number;
          color?: string | null;
          sort_order?: number | null;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          is_available: boolean;
          is_active: boolean;
          barcode: string | null;
          tax_rate: number | null;
          printer_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price: number;
          image_url?: string | null;
          is_available?: boolean;
          is_active?: boolean;
          barcode?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          category_id?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          is_available?: boolean;
          is_active?: boolean;
          barcode?: string | null;
          printer_name?: string | null;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          tenant_id: string;
          order_number: string;
          table_id: string | null;
          branch_id: string | null;
          order_type: 'dine_in' | 'takeaway' | 'delivery';
          status: 'open' | 'active' | 'pending' | 'completed' | 'cancelled';
          payment_status: 'unpaid' | 'partial' | 'paid' | 'pending';
          customer_name: string | null;
          customer_phone: string | null;
          customer_address: string | null;
          subtotal: number;
          tax_amount: number;
          discount_amount: number;
          total_amount: number;
          notes: string | null;
          waiter_id: string | null;
          waiter_name: string | null;
          courier_id: string | null;
          delivery_status: string | null;
          payment_method: string | null;
          payment_collected: boolean;
          created_at: string;
          completed_at: string | null;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          order_number?: string;
          table_id?: string | null;
          branch_id?: string | null;
          order_type?: 'dine_in' | 'takeaway' | 'delivery';
          status?: 'open' | 'active' | 'pending' | 'completed' | 'cancelled';
          payment_status?: 'unpaid' | 'partial' | 'paid' | 'pending';
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_address?: string | null;
          subtotal?: number;
          tax_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          notes?: string | null;
          waiter_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          order_number?: string;
          table_id?: string | null;
          branch_id?: string | null;
          order_type?: 'dine_in' | 'takeaway' | 'delivery';
          status?: 'open' | 'active' | 'pending' | 'completed' | 'cancelled';
          payment_status?: 'unpaid' | 'partial' | 'paid' | 'pending';
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_address?: string | null;
          subtotal?: number;
          tax_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          notes?: string | null;
          waiter_id?: string | null;
          completed_at?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          payment_collected?: boolean;
          payment_status_updated_at?: string | null;
          courier_id?: string | null;
          delivery_status?: string | null;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          tenant_id: string;
          product_id: string;
          variant_id: string | null;
          quantity: number;
          unit_price: number;
          total_amount: number;
          tax_rate: number | null;
          discount_amount: number | null;
          notes: string | null;
          variant_name: string | null;
          status: 'pending' | 'preparing' | 'ready' | 'served';
          cancellation_reason: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          created_at: string;
          paid_quantity: number | null;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          tenant_id: string;
          product_id: string;
          variant_id?: string | null;
          quantity: number;
          unit_price: number;
          total_amount: number;
          tax_rate?: number | null;
          notes?: string | null;
          variant_name?: string | null;
          status?: 'pending' | 'preparing' | 'ready' | 'served';
          created_at?: string;
          paid_quantity?: number | null;
          paid_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          total_amount?: number;
          notes?: string | null;
          status?: 'pending' | 'preparing' | 'ready' | 'served';
          cancellation_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          paid_quantity?: number | null;
          paid_at?: string | null;
        };
      };
    };
    Functions: {
      delete_tenant_user: {
        Args: { p_target_user_id: string };
        Returns: boolean;
      };
    };
  };
};
