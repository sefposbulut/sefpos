// src/lib/getirApi.ts
//
// ŞefPOS UI'dan Getir entegrasyon Edge Function'una giden tum istekler buradan
// gecer. UI bilesenleri sadece bu fonksiyonlari cagirir; URL/JWT/CORS detaylari
// burada toplanir.
//
// Kullanim:
//   const res = await callGetir({ platformId, action: 'pos-status-set', status: 100 });

import { supabase } from './supabase';

export interface GetirActionPayload {
  platformId: string;
  action:
    | 'pos-status-get'
    | 'pos-status-set'
    | 'login'
    | 'poll-active'
    | 'poll-unapproved'
    | 'poll-cancelled'
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

/**
 * Genel Getir Edge Function caller'i. Supabase JWT'yi otomatik ekler.
 * Bag agnostic: hata olursa { ok: false, error } doner — caller swallow eder.
 */
export async function callGetir(payload: GetirActionPayload): Promise<GetirActionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('getir-api', { body: payload });
    if (error) {
      return { ok: false, error: error.message || 'getir-api hatasi' };
    }
    return (data || { ok: false, error: 'bos yanit' }) as GetirActionResult;
  } catch (err: any) {
    return { ok: false, error: err?.message || 'getir-api beklenmedik hata' };
  }
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

/** Insani okunabilir Getir statu ismi. */
export function getirStatusLabel(code: number): string {
  switch (code) {
    case 325: return 'İleri tarih · ön onay bekliyor';
    case 350: return 'İleri tarih · ön onay alındı';
    case 400: return 'Yeni · onay bekliyor';
    case 500: return 'Hazırlanıyor';
    case 550: return 'Hazırlandı';
    case 600: return 'Kuryeye teslim edildi';
    case 700: return 'Kurye yolda';
    case 800: return 'Kurye adreste';
    case 900: return 'Teslim edildi';
    case 1500: return 'İptal (admin)';
    case 1600: return 'İptal';
    default: return `Statü ${code}`;
  }
}

/** Random 32 karakterli x-api-key uretici. */
export function generateGetirApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
