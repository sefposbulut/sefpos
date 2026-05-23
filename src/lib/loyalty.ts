import { supabase } from './supabase';

export type LoyaltyPaymentSelection = {
  customerId: string;
  customerName: string;
  redeemPoints: number;
  discountTl: number;
};

export type LoyaltySettings = {
  tenant_id: string;
  enabled: boolean;
  spend_tl_for_one_point: number;
  redeem_tl_per_point: number;
  min_redeem_points: number;
  welcome_bonus_points: number;
};

export const DEFAULT_LOYALTY_SETTINGS: Omit<LoyaltySettings, 'tenant_id'> = {
  enabled: true,
  spend_tl_for_one_point: 10,
  redeem_tl_per_point: 0.1,
  min_redeem_points: 20,
  welcome_bonus_points: 0,
};

export function calcLoyaltyDiscountTl(redeemPoints: number, redeemTlPerPoint: number): number {
  return Math.round(Math.max(0, redeemPoints) * redeemTlPerPoint * 100) / 100;
}

/** Bu sipariş tutarı için kullanılabilecek azami puan */
export function calcMaxRedeemPoints(
  customerPoints: number,
  billTotalTl: number,
  settings: Pick<LoyaltySettings, 'redeem_tl_per_point' | 'min_redeem_points'>,
): number {
  if (billTotalTl <= 0 || settings.redeem_tl_per_point <= 0) return 0;
  const maxByBill = Math.floor(billTotalTl / settings.redeem_tl_per_point);
  const pts = Math.min(Math.max(0, customerPoints), maxByBill);
  if (pts < settings.min_redeem_points) return 0;
  return pts;
}

export function calcEarnPointsPreview(
  paidTl: number,
  loyaltyDiscountTl: number,
  settings: Pick<LoyaltySettings, 'spend_tl_for_one_point'>,
): number {
  const base = Math.max(0, paidTl - loyaltyDiscountTl);
  if (settings.spend_tl_for_one_point <= 0) return 0;
  return Math.floor(base / settings.spend_tl_for_one_point);
}

export async function fetchLoyaltySettings(tenantId: string): Promise<LoyaltySettings> {
  const { data, error } = await supabase
    .from('loyalty_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error && !/loyalty_settings/i.test(error.message)) {
    console.warn('[Sadakat] ayarlar:', error.message);
  }

  if (data) {
    return {
      tenant_id: tenantId,
      enabled: !!data.enabled,
      spend_tl_for_one_point: Number(data.spend_tl_for_one_point) || 10,
      redeem_tl_per_point: Number(data.redeem_tl_per_point) || 0.1,
      min_redeem_points: Number(data.min_redeem_points) || 20,
      welcome_bonus_points: Number(data.welcome_bonus_points) || 0,
    };
  }

  return { tenant_id: tenantId, ...DEFAULT_LOYALTY_SETTINGS };
}

export async function saveLoyaltySettings(
  tenantId: string,
  patch: Partial<Omit<LoyaltySettings, 'tenant_id'>>,
): Promise<{ ok: boolean; error?: string }> {
  const row = {
    tenant_id: tenantId,
    enabled: patch.enabled ?? true,
    spend_tl_for_one_point: patch.spend_tl_for_one_point ?? DEFAULT_LOYALTY_SETTINGS.spend_tl_for_one_point,
    redeem_tl_per_point: patch.redeem_tl_per_point ?? DEFAULT_LOYALTY_SETTINGS.redeem_tl_per_point,
    min_redeem_points: patch.min_redeem_points ?? DEFAULT_LOYALTY_SETTINGS.min_redeem_points,
    welcome_bonus_points: patch.welcome_bonus_points ?? 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('loyalty_settings').upsert(row, { onConflict: 'tenant_id' });
  if (error) {
    const msg = error.message || '';
    if (/loyalty_settings/i.test(msg) && /schema cache|does not exist|bulunamad/i.test(msg)) {
      return {
        ok: false,
        error:
          'Sadakat tabloları henüz kurulmamış. Yöneticiniz `npm run db:migrate-remote` veya Supabase migration çalıştırmalı.',
      };
    }
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export type LoyaltyApplyResult = {
  ok: boolean;
  skipped?: boolean;
  discount_tl?: number;
  points_redeemed?: number;
  points_earned?: number;
  new_balance?: number;
  error?: string;
};

export async function loyaltyApplyForOrder(
  customerId: string,
  orderId: string,
  paidTl: number,
  redeemPoints: number,
): Promise<LoyaltyApplyResult> {
  const { data, error } = await supabase.rpc('loyalty_apply_for_order', {
    p_customer_id: customerId,
    p_order_id: orderId,
    p_paid_tl: paidTl,
    p_redeem_points: redeemPoints,
  });

  if (error) {
    const msg = error.message || '';
    if (
      /loyalty_apply_for_order/i.test(msg) &&
      (/schema cache|could not find/i.test(msg) || /updated_at/i.test(msg))
    ) {
      return {
        ok: false,
        error:
          'Sadakat fonksiyonu API önbelleğinde yok. Yönetici: Supabase Dashboard → Settings → API → Reload schema (veya birkaç dakika bekleyin).',
      };
    }
    return { ok: false, error: msg };
  }

  const row = data as Record<string, unknown> | null;
  if (!row?.ok) {
    return { ok: false, error: String(row?.error || 'Sadakat işlemi başarısız') };
  }

  return {
    ok: true,
    skipped: !!row.skipped,
    discount_tl: Number(row.discount_tl || 0),
    points_redeemed: Number(row.points_redeemed || 0),
    points_earned: Number(row.points_earned || 0),
    new_balance: Number(row.new_balance || 0),
  };
}
