import { sqlDb, localDb, isSqlServerMode, isLocalMode, isVdsBackend, getVdsApiOrigin } from './sqlDb';
import type { SupabaseClient } from './sefposTypes';

export type { RealtimeChannel, Session, SupabaseClient, User } from './sefposTypes';

/**
 * ŞefPOS veri istemcisi. Çalışma zamanında Supabase yoktur:
 * VDS / SQL Server `sqlDb`, çevrimdışı kasa `localDb`.
 */
function activeBackend() {
  if (isLocalMode() && !isSqlServerMode() && !isVdsBackend()) return localDb;
  return sqlDb;
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return (activeBackend() as any)[prop];
  },
});

export function getRealSupabaseClient(): SupabaseClient<Database> {
  return supabase;
}

export function getLoginLookupSupabase(): SupabaseClient<Database> {
  return supabase;
}

export function getCloudSupabaseClient(): SupabaseClient<Database> {
  return supabase;
}

export function getResolvedSupabaseAnonKey(): string {
  return 'vds-local';
}

export function getEdgeFunctionInvokeUrl(functionName: string): string {
  const origin = getVdsApiOrigin();
  return `${origin}/vds-api/fn/${encodeURIComponent(functionName)}`;
}

export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('shefpos_sql_session');
      const tok = raw ? JSON.parse(raw)?.access_token : null;
      if (tok) headers.Authorization = `Bearer ${tok}`;
    } catch {
      /* yoksay */
    }
  }
  const res = await fetch(getEdgeFunctionInvokeUrl(functionName), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  let data: unknown = null;
  if (rawText) {
    try { data = JSON.parse(rawText); } catch { data = null; }
  }
  const respBody = data as { success?: boolean; error?: string; message?: string } | null;
  if (!res.ok || respBody?.success === false) {
    throw new Error(respBody?.error || respBody?.message || `${functionName} başarısız (${res.status})`);
  }
  return data as T;
}

let invalidRefreshHandled = false;
export function consumeInvalidRefreshHandled(): boolean {
  const v = invalidRefreshHandled;
  invalidRefreshHandled = false;
  return v;
}

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
          branch_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          prefix?: string | null;
          color?: string;
          branch_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          prefix?: string | null;
          color?: string;
          branch_id?: string | null;
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
