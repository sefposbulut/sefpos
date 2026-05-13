/**
 * Plan-bazlı özellik kapısı.
 *
 * Şu an için kullanılan tek "ücretli özellik": **online_integrations**
 * (Yemeksepeti / Getir / Trendyol gibi platform entegrasyonları).
 *
 * Plan eşleştirme:
 *   trial / starter      → kilitli (Talep gönder)
 *   professional / enterprise + status in (active, trial) → açık
 *
 * Tenant.subscription_status 'suspended' veya 'cancelled' ise hangi planda
 * olursa olsun kilitli sayılır.
 */
import { supabase } from './supabase';

export type FeatureCode = 'online_integrations';

export interface FeatureGateTenant {
  id?: string;
  subscription_plan?: string | null;
  subscription_status?: string | null;
}

const PLAN_ALLOWS_ONLINE_INTEGRATIONS = new Set(['professional', 'enterprise']);
const ALLOWED_STATUSES_FOR_PAID = new Set(['active', 'trial']);

export function isFeatureUnlocked(
  feature: FeatureCode,
  tenant: FeatureGateTenant | null | undefined,
): boolean {
  if (!tenant) return false;
  const plan = (tenant.subscription_plan || '').toLowerCase();
  const status = (tenant.subscription_status || '').toLowerCase();
  if (!ALLOWED_STATUSES_FOR_PAID.has(status)) return false;
  if (feature === 'online_integrations') {
    return PLAN_ALLOWS_ONLINE_INTEGRATIONS.has(plan);
  }
  return false;
}

export interface FeatureRequestInput {
  tenantId: string;
  featureCode: FeatureCode;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
}

export interface FeatureRequestResult {
  ok: boolean;
  error?: string;
  alreadyPending?: boolean;
  requestId?: string;
}

/**
 * Kullanıcı kilitli bir özellik için "Talep Gönder" derse çağrılır.
 * Aynı tenant + feature_code için zaten 'pending' bir kayıt varsa yenisini
 * eklemez (alreadyPending=true). Aksi halde insert eder ve id döner.
 */
export async function submitFeatureRequest(
  input: FeatureRequestInput,
): Promise<FeatureRequestResult> {
  if (!input.tenantId) return { ok: false, error: 'Tenant bilgisi yok' };
  try {
    const { data: existing, error: selErr } = await supabase
      .from('feature_requests')
      .select('id, status, created_at')
      .eq('tenant_id', input.tenantId)
      .eq('feature_code', input.featureCode)
      .eq('status', 'pending')
      .maybeSingle();
    if (selErr) {
      // 42P01 (relation does not exist) ise migration henüz uygulanmamış olabilir;
      // bu durumda mesaj kullanıcıya gösterilsin ama çökmesin.
      return { ok: false, error: selErr.message };
    }
    if (existing) {
      return { ok: true, alreadyPending: true, requestId: existing.id };
    }
    const { data, error } = await supabase
      .from('feature_requests')
      .insert({
        tenant_id: input.tenantId,
        feature_code: input.featureCode,
        requested_email: input.email || null,
        requested_phone: input.phone || null,
        message: input.message || null,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, requestId: data.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Etiketler — UI'da plan ismi ve özellik adı kullanıcıya gösterilirken kullanılır. */
export const FEATURE_LABELS: Record<FeatureCode, { tr: string; planRequired: string }> = {
  online_integrations: {
    tr: 'Online Platform Entegrasyonu',
    planRequired: 'Profesyonel veya Kurumsal',
  },
};
