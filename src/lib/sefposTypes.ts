/** ŞefPOS oturum tipleri. Eski Supabase istemcisinden bağımsız. */

export type User = {
  id: string;
  email?: string | null;
  phone?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  aud?: string;
  role?: string;
  created_at?: string;
};

export type Session = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user: User;
};

export type RealtimeChannel = {
  on: (...args: unknown[]) => RealtimeChannel;
  subscribe: (cb?: (status: string) => void) => RealtimeChannel;
  unsubscribe?: () => void;
};

/** Sorgu kurucusu sqlDb / localDb tarafından doldurulur. */
export type SupabaseClient<_T = unknown> = {
  from: (table: string) => any;
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  auth: any;
  channel: (name: string, opts?: unknown) => RealtimeChannel;
  removeChannel: (ch: RealtimeChannel) => void;
  functions?: { invoke: (name: string, opts?: { body?: unknown }) => Promise<{ data: any; error: any }> };
  storage?: any;
};
