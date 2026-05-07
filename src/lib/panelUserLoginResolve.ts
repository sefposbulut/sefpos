import { supabase } from './supabase';

export type PanelUsernameResolve =
  | { ok: true; email: string }
  | { ok: false; reason: 'not_found' | 'ambiguous' | 'invalid_username' };

/**
 * Kullanıcı yönetiminden eklenen hesaplar `username@<tenant8>.shefpos.local` e-postasıyla oluşur.
 * Anon RLS bu desene izin verir; girişte yalnızca kullanıcı adı yazılabilsin diye e-postaya çözülür.
 */
export async function resolvePanelUsernameToEmail(usernameInput: string): Promise<PanelUsernameResolve> {
  const sanitized = usernameInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!sanitized || sanitized.length < 2) {
    return { ok: false, reason: 'invalid_username' };
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .ilike('email', `${sanitized}@%.shefpos.local`)
    .limit(2);
  if (error || !data?.length) {
    return { ok: false, reason: 'not_found' };
  }
  if (data.length > 1) {
    return { ok: false, reason: 'ambiguous' };
  }
  const em = (data[0] as { email?: string })?.email;
  if (!em) return { ok: false, reason: 'not_found' };
  return { ok: true, email: em };
}
