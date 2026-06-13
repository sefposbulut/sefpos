import { getTrialInfo, formatTrialRemaining, type TenantTrialFields } from './tenantTrial';

const DAY_MS = 24 * 60 * 60 * 1000;

const PLAN_LABELS: Record<string, string> = {
  trial: 'Deneme',
  starter: 'Başlangıç',
  professional: 'Profesyonel',
  enterprise: 'Kurumsal',
};

export interface LicenseInfo {
  planLabel: string;
  statusLabel: string;
  expiresAt: Date | null;
  remainingText: string;
  expired: boolean;
  expiringSoon: boolean;
  blocked: boolean;
  isTrial: boolean;
}

const EMPTY: LicenseInfo = {
  planLabel: '—',
  statusLabel: '—',
  expiresAt: null,
  remainingText: '',
  expired: false,
  expiringSoon: false,
  blocked: false,
  isTrial: false,
};

function formatRemainingMs(remainingMs: number): string {
  if (remainingMs <= 0) return 'Süre doldu';
  if (remainingMs >= DAY_MS) {
    const days = Math.ceil(remainingMs / DAY_MS);
    return days === 1 ? '1 gün' : `${days} gün`;
  }
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  return hours <= 1 ? '1 saat' : `${hours} saat`;
}

/** Ayka lisans panelindeki tenant alanlarından masaüstü rozeti için özet. */
export function getLicenseInfo(tenant: TenantTrialFields | null | undefined): LicenseInfo {
  if (!tenant) return EMPTY;

  const status = (tenant.subscription_status || '').toLowerCase();
  const plan = (tenant.subscription_plan || '').toLowerCase();

  if (status === 'suspended' || status === 'cancelled') {
    return {
      planLabel: PLAN_LABELS[plan] || plan || 'Lisans',
      statusLabel: status === 'suspended' ? 'Askıda' : 'İptal',
      expiresAt: tenant.subscription_expires_at ? new Date(tenant.subscription_expires_at) : null,
      remainingText: 'Erişim kapalı',
      expired: true,
      expiringSoon: false,
      blocked: true,
      isTrial: false,
    };
  }

  const trialInfo = getTrialInfo(tenant);
  if (trialInfo.isTrial) {
    return {
      planLabel: 'Deneme',
      statusLabel: trialInfo.expired ? 'Süre doldu' : 'Aktif',
      expiresAt: trialInfo.endDate,
      remainingText: formatTrialRemaining(trialInfo),
      expired: trialInfo.expired,
      expiringSoon: !trialInfo.expired && trialInfo.remainingDays <= 7,
      blocked: trialInfo.expired,
      isTrial: true,
    };
  }

  const expiresAt = tenant.subscription_expires_at ? new Date(tenant.subscription_expires_at) : null;
  const remainingMs = expiresAt ? expiresAt.getTime() - Date.now() : Infinity;
  const expired = expiresAt ? remainingMs <= 0 : false;
  const expiringSoon = expiresAt ? remainingMs > 0 && remainingMs < 7 * DAY_MS : false;

  let remainingText = '—';
  if (expiresAt) {
    remainingText = formatRemainingMs(remainingMs);
  } else if (status === 'active') {
    remainingText = 'Süresiz';
  }

  return {
    planLabel: PLAN_LABELS[plan] || plan || 'Lisans',
    statusLabel: expired ? 'Süre doldu' : status === 'active' ? 'Aktif' : status || '—',
    expiresAt,
    remainingText,
    expired,
    expiringSoon,
    blocked: expired,
    isTrial: false,
  };
}
