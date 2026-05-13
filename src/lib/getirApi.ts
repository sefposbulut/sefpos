// src/lib/getirApi.ts
//
// ŞefPOS UI'dan Getir entegrasyon Edge Function'una giden tum istekler buradan
// gecer. UI bilesenleri sadece bu fonksiyonlari cagirir; URL/JWT/CORS detaylari
// burada toplanir.
//
// Kullanim:
//   const res = await callGetir({ platformId, action: 'pos-status-set', status: 100 });

import { supabase } from './supabase';
import {
  GETIR_NUMERIC_STATUS_MAP,
  INTERNAL_UNKNOWN_STATUS,
  mapUnknownNumeric,
} from '../../supabase/functions/_shared/getirOrderStatus';

export interface GetirActionPayload {
  platformId: string;
  action:
    | 'pos-status-get'
    | 'pos-status-set'
    | 'login'
    | 'poll-active'
    | 'poll-unapproved'
    | 'poll-cancelled'
    | 'inquiry'
    | 'verify'
    | 'verify-scheduled'
    | 'prepare'
    | 'handover'
    | 'deliver'
    | 'cancel'
    | 'restaurant-status-open'
    | 'restaurant-status-close'
    | 'restaurant-busy'
    | 'product-status-set'
    | 'option-product-set'
    | 'menu-get';
  orderId?: string;
  productId?: string;
  chainProductId?: string;
  optionProductId?: string;
  cancelReasonId?: string;
  cancelNote?: string;
  status?: number;
  isBusy?: boolean;
  busynessDifferenceDuration?: number;
  timeOffAmount?: number;
  payload?: Record<string, unknown>;
}

export interface GetirActionResult {
  ok: boolean;
  status?: number;
  error?: string;
  data?: unknown;
  fetched?: number;
  saved?: number;
  expiresAt?: string;
  isFirstTime?: boolean;
}

/** Ayni anda birden fazla getir-api istegi 429 uretir; sirayla gonder. */
let getirApiChain: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Genel Getir Edge Function caller'i. Supabase JWT'yi otomatik ekler.
 * - Tum cagrilar tek sira (mutex) ile seri calisir → burst 429 azalir.
 * - HTTP 429 alinirsa exponential backoff ile birkaç kez yeniden dener.
 */
export async function callGetir(payload: GetirActionPayload): Promise<GetirActionResult> {
  const run = async (): Promise<GetirActionResult> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { ok: false, error: 'Oturum bulunamadi' };

      const baseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://xdfnozfuuzctubijbnds.supabase.co').replace(/\/$/, '');
      const url = `${baseUrl}/functions/v1/getir-api`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '',
      };

      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          const backoff = Math.min(12_000, 900 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 400);
          await sleep(backoff);
        }

        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        let raw = '';
        let data: any = {};
        try {
          raw = await resp.text();
          data = raw ? JSON.parse(raw) : {};
        } catch {
          if (resp.status === 429 && attempt < maxAttempts - 1) continue;
          return { ok: false, status: resp.status, error: raw || `HTTP ${resp.status}` };
        }

        if (resp.status === 429 && attempt < maxAttempts - 1) {
          continue;
        }

        if (typeof data === 'object' && data !== null && 'ok' in data) {
          const out = data as GetirActionResult;
          return { ...out, status: out.status ?? resp.status };
        }
        return { ok: resp.ok, status: resp.status, data, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      return { ok: false, status: 429, error: 'Getir sunucusu meşgul (429). Bir süre sonra tekrar deneyin.' };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'getir-api beklenmedik hata' };
    }
  };

  const p = getirApiChain.then(run, run) as Promise<GetirActionResult>;
  getirApiChain = p.then(() => undefined, () => undefined);
  return p;
}

/**
 * Getir iptal sebepleri — Resmi dokumandan, statuye gore aktif olanlar
 * UI'dan secilebilir.
 */
export interface GetirCancelReason {
  id: string;
  text: string;
  /** Bu sebebin gecerli oldugu Getir order statuleri (Restoran Getirsin). */
  restoranStatuses: number[];
  /** Getir Getirsin statuleri. */
  getirStatuses: number[];
}

export const GETIR_CANCEL_REASONS: GetirCancelReason[] = [
  {
    id: '5f05b1392765e85c5d0432d2',
    text: 'Restoranda kurye yok / musait degil',
    restoranStatuses: [325, 350, 400],
    getirStatuses: [],
  },
  {
    id: '5f05b13f2765e85c5d0432d3',
    text: 'Teknik problem (internet/elektrik/usta yok)',
    restoranStatuses: [325, 350, 400, 500],
    getirStatuses: [400, 500, 550],
  },
  {
    id: '5e1469f7916c7a55cfc2aede',
    text: 'Adres servis alanı dışında',
    restoranStatuses: [325, 350, 400, 500, 700],
    getirStatuses: [],
  },
  {
    id: '5c5b49b068f6a45d427f0a8f',
    text: 'Restoran yoğun',
    restoranStatuses: [325, 350, 400, 500],
    getirStatuses: [400, 500],
  },
  {
    id: '5f0875342ce13c10cbf1c0e6',
    text: 'Hava muhalefeti',
    restoranStatuses: [325, 350, 400, 500],
    getirStatuses: [],
  },
  {
    id: '5c5b495768f6a45d427f0a8d',
    text: 'Restoran kapalı',
    restoranStatuses: [325, 350, 400, 500],
    getirStatuses: [400, 500],
  },
  {
    id: '5c5b49a768f6a45d427f0a8e',
    text: 'Üründe eksik var',
    restoranStatuses: [325, 350, 400, 500],
    getirStatuses: [400, 500],
  },
  {
    id: '6088226bdaa34255a5693e23',
    text: 'Sipariş minimum sepet tutarı altında',
    restoranStatuses: [325, 350, 400, 500, 700],
    getirStatuses: [],
  },
];

/** Verilen statu icin gecerli iptal sebeplerini doner (deliveryType: 1=Getir, 2=Restoran). */
export function eligibleCancelReasons(getirStatus: number, deliveryType: number): GetirCancelReason[] {
  return GETIR_CANCEL_REASONS.filter((r) =>
    deliveryType === 1 ? r.getirStatuses.includes(getirStatus) : r.restoranStatuses.includes(getirStatus),
  );
}

/** İnsan okunur Getir statü adı — kodlar `_shared/getirOrderStatus` ile Getir Food API dokümantasyonuyla hizalı. */
export function getirStatusLabel(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(Number(code))) return 'Durum kodu yok';
  const n = Number(code);
  const row = GETIR_NUMERIC_STATUS_MAP[n];
  if (row) {
    const hints: Record<number, string> = {
      325: `${row.labelTr} · onay bekleniyor`,
      350: `İleri tarihli · ${row.labelTr.toLowerCase()}`,
      400: `${row.labelTr} · hazırlanmaya başlanabilir`,
      500: `${row.labelTr} · kuryeye teslim bekleniyor`,
      550: 'Kurye siparişi teslim aldı',
      1500: 'İptal (yönetici)',
    };
    return hints[n] ?? row.labelTr;
  }
  return mapUnknownNumeric(n).labelTr;
}

/**
 * Kullaniciya sonraki adimi aciklar (Getir paneli ile ayni sira).
 */
export function getGetirNextStepHint(code: number, deliveryType: number | null | undefined): string {
  const dt = deliveryType ?? 0;
  if (code === 325 || code === 350) {
    return 'Sıradaki adım: ŞefPOS’tan «Onayla» (Getir’e kabul bildirimi).';
  }
  if (code === 400) {
    return 'Sıradaki adım: «Hazırlanmaya başla» ile mutfağı başlatın.';
  }
  if (code === 410) {
    return 'Getir tarafında sipariş hâlâ «Hazırlanıyor». Kuryeye teslim ancak Getir durumu «Hazır» (500) olunca mümkündür. «Getir ile durumu eşle» ile güncelleyin.';
  }
  if (code === 500) {
    return dt === 1
      ? 'Sıradaki adım: «Getir kuryesine teslim ettim» (elden teslim).'
      : 'Sıradaki adım: «Kurye yola çıktı» (restoran kuryesi).';
  }
  if (code === 550 || code === 600 || code === 700) {
    return dt === 1
      ? 'Getir kuryesi süreci yönetiyor; restoran tarafında ek işlem gerekmez.'
      : 'Sıradaki adım: Teslimatta «Teslim edildi».';
  }
  if (code === 800) {
    return 'Kurye adreste; teslim onayı Getir tarafında tamamlanır.';
  }
  return '';
}

/** Siparis ekraninda hangi aksiyon blogunun gosterilecegi (kod oncelikli). */
export type GetirUiPhase =
  | 'verify'
  | 'prepare'
  | 'preparing_wait'
  | 'handover'
  | 'getir_courier_enroute'
  | 'deliver'
  | 'scheduled_accepted_wait'
  | 'arrived_info'
  | 'done';

export function getGetirUiPhase(order: {
  status: string;
  getir_status_code?: number | null;
  getir_is_scheduled?: boolean | null;
  getir_delivery_type?: number | null;
}): GetirUiPhase {
  const code = typeof order.getir_status_code === 'number' ? order.getir_status_code : null;
  const dt = order.getir_delivery_type ?? 0;

  if (order.status === 'delivered' || code === 900) return 'done';
  if (
    order.status === 'cancelled' ||
    order.status === 'rejected' ||
    order.status === INTERNAL_UNKNOWN_STATUS ||
    code === 1500 ||
    code === 1600
  ) {
    return 'done';
  }
  if (order.status === 'scheduled_accepted') return 'scheduled_accepted_wait';

  if (code !== null) {
    if (code === 325 || code === 350) return 'verify';
    if (code === 400) return 'prepare';
    if (code === 410) return 'preparing_wait';
    if (code === 500) return 'handover';
    if (code === 550) return dt === 1 ? 'getir_courier_enroute' : 'deliver';
    if (code === 600 || code === 700) return dt === 1 ? 'getir_courier_enroute' : 'deliver';
    if (code === 800) return 'arrived_info';
  }

  if (order.status === 'new' || order.status === 'scheduled_new') return 'verify';
  if (order.status === 'verified' || order.status === 'accepted') return 'prepare';
  if (order.status === 'preparing') return 'preparing_wait';
  if (order.status === 'ready') return 'handover';
  if (order.status === 'handed_over' || order.status === 'on_the_way') {
    return dt === 1 ? 'getir_courier_enroute' : 'deliver';
  }
  if (order.status === 'arrived') return 'arrived_info';
  return 'verify';
}

/** Random 32 karakterli x-api-key uretici. */
export function generateGetirApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
