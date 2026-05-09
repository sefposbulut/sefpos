/**
 * Tenant deneme (trial) durumu hesaplayicisi.
 *
 * - Yeni kayitlarda DB tarafi (handle_new_user) tenant'i 3 gunluk trial olarak
 *   olusturur: subscription_status='trial', subscription_plan='trial',
 *   subscription_expires_at = now() + 3 days.
 * - Eski tenantlarda subscription_status 'active' olabilir; o durumda
 *   subscription_plan='trial' kontrolu yedek olarak kullanilir.
 * - subscription_expires_at yoksa created_at + 3 gun varsayilir.
 */
export interface TrialInfo {
  /** Tenant trial planinda mi? */
  isTrial: boolean;
  /** Trial bitis tarihi gectiyse true. */
  expired: boolean;
  /** Pozitif kalan gun sayisi (yukari yuvarlanmis). */
  remainingDays: number;
  /** Pozitif kalan saat sayisi (yukari yuvarlanmis). */
  remainingHours: number;
  /** Negatif olabilir; expired hesabinda kullanilir. */
  remainingMs: number;
  /** Hesaplanan bitis. */
  endDate: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const EMPTY: TrialInfo = {
  isTrial: false,
  expired: false,
  remainingDays: 0,
  remainingHours: 0,
  remainingMs: 0,
  endDate: null,
};

export interface TenantTrialFields {
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
  created_at?: string | null;
}

export function getTrialInfo(tenant: TenantTrialFields | null | undefined): TrialInfo {
  if (!tenant) return EMPTY;
  const status = (tenant.subscription_status || '').toLowerCase();
  const plan = (tenant.subscription_plan || '').toLowerCase();
  const isTrial = status === 'trial' || (plan === 'trial' && status !== 'suspended' && status !== 'cancelled');
  if (!isTrial) return EMPTY;

  const endMs = tenant.subscription_expires_at
    ? new Date(tenant.subscription_expires_at).getTime()
    : tenant.created_at
      ? new Date(tenant.created_at).getTime() + 3 * DAY_MS
      : NaN;

  if (!Number.isFinite(endMs)) {
    return { ...EMPTY, isTrial: true };
  }

  const remainingMs = endMs - Date.now();
  return {
    isTrial: true,
    expired: remainingMs <= 0,
    remainingDays: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
    remainingHours: Math.max(0, Math.ceil(remainingMs / HOUR_MS)),
    remainingMs,
    endDate: new Date(endMs),
  };
}

/** Trial bitisini Turkce kisa olarak donduren formatlayici. ('2 gün 5 saat' gibi) */
export function formatTrialRemaining(info: TrialInfo): string {
  if (!info.isTrial) return '';
  if (info.expired) return 'Süre doldu';
  if (info.remainingMs >= DAY_MS) {
    const days = Math.floor(info.remainingMs / DAY_MS);
    const hours = Math.floor((info.remainingMs - days * DAY_MS) / HOUR_MS);
    if (days >= 2 || hours === 0) return `${days} gün`;
    return `${days} gün ${hours} sa`;
  }
  if (info.remainingMs >= HOUR_MS) return `${Math.floor(info.remainingMs / HOUR_MS)} saat`;
  return `${Math.max(1, Math.ceil(info.remainingMs / 60000))} dk`;
}
