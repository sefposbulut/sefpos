import { supabase, getCloudSupabaseClient } from './supabase';
import { isSqlServerMode } from './sqlDb';

export type PlatformReleasePolicy = {
  min_required_version: string;
  force_update: boolean;
  message: string;
  updated_at?: string;
};

const DEFAULT_POLICY: PlatformReleasePolicy = {
  min_required_version: '1.0.0',
  force_update: false,
  message: '',
};

export function parseVersionParts(v: string): number[] {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/** a < b */
export function versionLessThan(a: string, b: string): boolean {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return true;
    if (da > db) return false;
  }
  return false;
}

export async function fetchPlatformReleasePolicy(): Promise<PlatformReleasePolicy> {
  const useCloudClient =
    typeof window !== 'undefined' &&
    !!(window as any).electronAPI &&
    isSqlServerMode();
  const client = useCloudClient ? getCloudSupabaseClient() : supabase;
  const { data, error } = await client
    .from('platform_release_policy')
    .select('min_required_version, force_update, message, updated_at')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_POLICY };
  return {
    min_required_version: String(data.min_required_version || '1.0.0'),
    force_update: !!data.force_update,
    message: String(data.message || ''),
    updated_at: data.updated_at,
  };
}

export async function savePlatformReleasePolicy(
  policy: Pick<PlatformReleasePolicy, 'min_required_version' | 'force_update' | 'message'>,
  userId?: string,
): Promise<{ error: string | null }> {
  const row = {
    id: 'default',
    min_required_version: policy.min_required_version.trim() || '1.0.0',
    force_update: !!policy.force_update,
    message: policy.message.trim(),
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };
  const { error } = await supabase.from('platform_release_policy').upsert(row);
  return { error: error?.message || null };
}

export function isMandatoryUpdateRequired(
  currentVersion: string,
  policy: PlatformReleasePolicy,
): boolean {
  if (!policy.force_update) return false;
  const min = policy.min_required_version.trim();
  if (!min) return false;
  return versionLessThan(currentVersion, min);
}
