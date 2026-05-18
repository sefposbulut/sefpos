import { supabase } from './supabase';

export type HemenyoldaWebhookAction = 'new' | 'update' | 'cancel';

export type HemenyoldaTestSample =
  | 'getir'
  | 'yemeksepeti'
  | 'trendyol'
  | 'telefon'
  | 'update'
  | 'cancel';

export interface HemenyoldaIntegrationRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  app_name: string;
  access_token: string;
  is_active: boolean;
  is_test_mode: boolean;
  base_url: string;
  last_push_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HemenyoldaPushResult {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  order_id?: string;
  action?: string;
  status?: number;
  error?: string;
  url?: string;
  message?: string;
  hint?: string;
  note?: string;
  errors?: Record<string, string[]>;
}

/** POS siparişini HemenYolda'ya gönder (fire-and-forget; hata konsola). */
export function notifyHemenYolda(
  orderId: string,
  action: HemenyoldaWebhookAction,
  branchId?: string | null,
): void {
  void pushHemenYoldaOrder(orderId, action, branchId).catch((e) => {
    console.warn('[HemenYolda]', action, orderId, e);
  });
}

function parseFunctionResult(
  data: unknown,
  error: { message?: string } | null,
): HemenyoldaPushResult {
  const body = (data && typeof data === 'object' ? data : {}) as HemenyoldaPushResult & {
    error?: string;
    message?: string;
  };
  if (error) {
    const detail =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      error.message ||
      'İstek başarısız';
    return { ...body, ok: false, error: detail };
  }
  return body;
}

export async function pushHemenYoldaOrder(
  orderId: string,
  action: HemenyoldaWebhookAction,
  branchId?: string | null,
  force = false,
): Promise<HemenyoldaPushResult> {
  const { data, error } = await supabase.functions.invoke('hemenyolda-webhook-push', {
    body: { order_id: orderId, action, branch_id: branchId ?? undefined, force },
  });
  return parseFunctionResult(data, error);
}

export async function sendHemenYoldaTestSample(
  sample: HemenyoldaTestSample,
  certification = false,
): Promise<HemenyoldaPushResult> {
  const { data, error } = await supabase.functions.invoke('hemenyolda-webhook-push', {
    body: { mode: 'test', sample, certification },
  });
  return parseFunctionResult(data, error);
}

export function maskToken(token: string): string {
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 8)}…${token.slice(-6)}`;
}
