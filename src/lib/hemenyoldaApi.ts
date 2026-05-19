import { supabase } from './supabase';

export type HemenyoldaWebhookAction = 'new' | 'update' | 'cancel';

export type HemenyoldaTestSample =
  | 'getir'
  | 'yemeksepeti'
  | 'trendyol'
  | 'telefon'
  | 'update'
  | 'cancel';

/** Sertifikasyon paketi sırası (HemenYolda dokümanı). */
export const HEMENYOLDA_CERT_SEQUENCE: HemenyoldaTestSample[] = [
  'getir',
  'yemeksepeti',
  'trendyol',
  'telefon',
  'update',
  'cancel',
];

export const HEMENYOLDA_CERT_STEP_LABELS: Record<HemenyoldaTestSample, string> = {
  getir: '1. Getir — yeni sipariş',
  yemeksepeti: '2. YemekSepeti — yeni sipariş',
  trendyol: '3. Trendyol — yeni sipariş',
  telefon: '4. Telefon — yeni sipariş',
  update: '5. Sipariş güncelleme',
  cancel: '6. Sipariş iptali',
};

/** HemenYolda sertifikasyon mailinde iletilecek sabit sipariş id'leri (doküman). */
export const HEMENYOLDA_CERT_MAIL_ORDER_IDS: Record<HemenyoldaTestSample, string> = {
  getir: '6555dc4a1fcf792dd71545b11033',
  yemeksepeti: 'order_id-123-123',
  trendyol: 'ty-order-2023-88421',
  telefon: '22453344213',
  update: 'order_id-123-123',
  cancel: 'order_id-123-123',
};

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
    hint?: string;
  };

  const detailFromBody =
    (typeof body.hint === 'string' && body.hint) ||
    (typeof body.message === 'string' && body.message) ||
    (typeof body.error === 'string' && body.error) ||
    null;

  if (body.ok === true || body.status === 204) {
    return { ...body, ok: true };
  }

  if (detailFromBody) {
    return { ...body, ok: false, error: detailFromBody };
  }

  if (error) {
    return {
      ...body,
      ok: false,
      error: error.message || 'İstek başarısız',
    };
  }

  return { ...body, ok: body.ok ?? false };
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

/** Edge test yanıtı başarılı sayılır (204 veya kayıtlı id tekrarı). */
export function isHemenYoldaTestSuccess(res: HemenyoldaPushResult): boolean {
  if (res.ok === true || res.status === 204) return true;
  const t = `${res.note || ''} ${res.hint || ''} ${res.error || ''}`.toLowerCase();
  return t.includes('zaten kayıtlı') || t.includes('unique');
}

export function buildHemenYoldaCertMailText(appName: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const name = appName.trim() || 'test-pos';
  const today = new Date().toLocaleDateString('tr-TR');
  const lines = HEMENYOLDA_CERT_SEQUENCE.map(
    (s) => `- ${HEMENYOLDA_CERT_STEP_LABELS[s].replace(/^\d+\.\s*/, '')}: ${HEMENYOLDA_CERT_MAIL_ORDER_IDS[s]}`,
  );
  return [
    'Konu: ŞefPOS – HemenYolda webhook sertifikasyon tamamlandı',
    '',
    'Merhaba HemenYolda Destek Ekibi,',
    '',
    `ŞefPOS (SEFPOS) olarak ${today} tarihinde test ortamında webhook sertifikasyon paketini tamamladık.`,
    '',
    `APP_NAME: ${name}`,
    `Endpoint: ${base}/api/integration/${name}/`,
    '',
    'Test sipariş id’leri (doküman):',
    ...lines,
    '',
    'Tüm istekler HTTP 204 (veya kayıtlı id tekrarı) döndü.',
    '',
    'Teşekkürler,',
    '[İşletme adı / iletişim]',
  ].join('\n');
}
