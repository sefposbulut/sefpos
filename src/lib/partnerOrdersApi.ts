/** Kurumsal dış partner REST API — paket/teslimat siparişleri. */

import { getPartnerWebhookBaseUrl } from './publicWebhookBaseUrl';

export function getPartnerOrdersApiBaseUrl(): string {
  const base = getPartnerWebhookBaseUrl().replace(/\/$/, '');
  return `${base}/integrations/partner`;
}

export function partnerOrdersApiBaseUrl(): string {
  return getPartnerOrdersApiBaseUrl();
}

export function generatePartnerApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sp_live_${hex}`;
}

export function maskPartnerApiKey(key: string): string {
  if (key.length <= 16) return '••••••••';
  return `${key.slice(0, 12)}••••••••${key.slice(-4)}`;
}

export interface PartnerApiClientRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  partner_name: string;
  partner_reference: string | null;
  api_key: string;
  api_key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}
