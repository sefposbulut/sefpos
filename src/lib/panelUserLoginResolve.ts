import { getLoginLookupSupabase } from './supabase';
import { phoneToAuthEmail } from './phoneAuthEmail';

export type LoginIdentifierKind = 'email' | 'phone' | 'username';

export type LoginIdentifierResolve =
  | { ok: true; email: string; kind: LoginIdentifierKind }
  | { ok: false; reason: 'not_found' | 'ambiguous' | 'invalid'; message?: string };

/** Sadece a-z0-9, 2+ karakter (kullanici adi normalizasyonu) */
function sanitizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Telefon: 10-11 hane (basinda 0 olmasa da kabul, normalize 0 ekleyerek) */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return null;
  return digits.length === 10 ? '0' + digits : digits;
}

const isPlausibleEmail = (val: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

/**
 * Tek bir giris alanindan email/telefon/kullanici adi tespit edip
 * Supabase Auth icin gerekli e-postaya cevirir.
 *
 * Sirayla:
 *   1) `@` varsa  → e-posta (oldugu gibi)
 *   2) Sadece rakam (10-11 hane) → telefon
 *      a. profiles.phone='X' satiri varsa onun email'i
 *      b. yoksa phoneToAuthEmail(X) (sentetik)
 *   3) Diger her sey → username
 *      profiles.username='X' satirinin email'i
 *
 * Anon RLS politikasi (`Anon login identifier lookup`) bu lookup'lara izin verir.
 */
export async function resolveLoginIdentifier(input: string): Promise<LoginIdentifierResolve> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'invalid', message: 'Kullanıcı bilgisi girin' };

  // 1) E-posta
  if (trimmed.includes('@')) {
    if (!isPlausibleEmail(trimmed)) {
      return { ok: false, reason: 'invalid', message: 'Geçersiz e-posta' };
    }
    return { ok: true, email: trimmed.toLowerCase(), kind: 'email' };
  }

  // 2) Telefon
  const phone = normalizePhone(trimmed);
  if (phone) {
    const { data, error } = await getLoginLookupSupabase()
      .from('profiles')
      .select('email')
      .eq('phone', phone)
      .limit(2);
    if (!error && data && data.length === 1) {
      const em = (data[0] as { email?: string }).email;
      if (em) return { ok: true, email: em, kind: 'phone' };
    }
    if (!error && data && data.length > 1) {
      return { ok: false, reason: 'ambiguous', message: 'Bu telefon birden fazla hesapla eşleşiyor; e-posta veya kullanıcı adıyla giriş yapın.' };
    }
    // Kayitli profil yok → sentetik garson/telefon e-postasini dene
    return { ok: true, email: phoneToAuthEmail(phone), kind: 'phone' };
  }

  // 3) Username
  const u = sanitizeUsername(trimmed);
  if (u.length < 2) {
    return { ok: false, reason: 'invalid', message: 'Kullanıcı adı en az 2 karakter olmalı' };
  }

  // Once gercek `username` kolonunu dene
  {
    const { data, error } = await getLoginLookupSupabase()
      .from('profiles')
      .select('email')
      .eq('username', u)
      .limit(2);
    if (!error && data && data.length === 1) {
      const em = (data[0] as { email?: string }).email;
      if (em) return { ok: true, email: em, kind: 'username' };
    }
    if (!error && data && data.length > 1) {
      return { ok: false, reason: 'ambiguous', message: 'Bu kullanıcı adı birden fazla firmada var; tam e-posta adresinizi girin.' };
    }
  }

  // Geri uyumluluk: eski kayitlarda username bos olabilir; email pattern fallback
  {
    const { data, error } = await getLoginLookupSupabase()
      .from('profiles')
      .select('email')
      .ilike('email', `${u}@%.shefpos.local`)
      .limit(2);
    if (!error && data && data.length === 1) {
      const em = (data[0] as { email?: string }).email;
      if (em) return { ok: true, email: em, kind: 'username' };
    }
    if (!error && data && data.length > 1) {
      return { ok: false, reason: 'ambiguous', message: 'Bu kullanıcı adı birden fazla firmada var; tam e-posta adresinizi girin.' };
    }
  }

  return { ok: false, reason: 'not_found', message: 'Kullanıcı bulunamadı. Kullanıcı adını / telefonu / e-postayı kontrol edin.' };
}

/** @deprecated Eski isim — `resolveLoginIdentifier` kullanın. */
export const resolvePanelUsernameToEmail = async (input: string) => {
  const r = await resolveLoginIdentifier(input);
  if (r.ok) return { ok: true as const, email: r.email };
  return { ok: false as const, reason: r.reason };
};
