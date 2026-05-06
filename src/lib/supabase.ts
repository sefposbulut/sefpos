import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sqlDb, localDb, isSqlServerMode, isLocalMode } from './sqlDb';

const isElectronRuntime = !!(window as any).electronAPI;
const runtimeDbUrl = localStorage.getItem('shefpos_db_url');
const runtimeDbAnonKey = localStorage.getItem('shefpos_db_anon_key');

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  runtimeDbUrl ||
  'https://orlydeyxshsdusxukhuu.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  runtimeDbAnonKey ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybHlkZXl4c2hzZHVzeHVraHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjI0MTcsImV4cCI6MjA5MDAzODQxN30.tbFxkDsVyw0b97l8bop5prHlxDhmmfnsc8rC8zP8FqI';

if (!import.meta.env.VITE_SUPABASE_URL && !runtimeDbUrl) {
  console.warn('Supabase environment variables missing - offline mode');
}

const edgeFunctionsBaseUrl = `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1`;

function edgeFunctionRequestBase(): string {
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ) {
    // Vite proxy: tarayıcıdan doğrudan *.supabase.co OPTIONS/CORS hatası olmadan
    return `${window.location.origin}/__supabase-functions`;
  }
  return edgeFunctionsBaseUrl;
}

/** Edge Function — URL ve anahtar, üstteki createClient ile aynı (VITE_* / localStorage). */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
  const body = JSON.stringify(payload);
  const primaryBase = edgeFunctionRequestBase();
  let res = await fetch(`${primaryBase}/${functionName}`, { method: 'POST', headers, body });
  // Vite proxy .env okunmadıysa /__supabase-functions 404 döner; doğrudan Supabase'e düş.
  if (res.status === 404 && primaryBase.includes('__supabase-functions')) {
    res = await fetch(`${edgeFunctionsBaseUrl}/${functionName}`, { method: 'POST', headers, body });
  }
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

const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: (url, init) => {
      if (isSqlServerMode() || isLocalMode()) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      // Do not swallow network errors into fake 200/[] — that breaks RPC booleans, deletes, and error handling.
      return fetch(url, init);
    },
  },
});

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
