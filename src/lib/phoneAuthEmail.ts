/**
 * Telefon → Supabase Auth e-postası (sentetik domain).
 * - 05… / 90… → 10 hane 5XXXXXXXXX
 * - Yerel parça `m` + rakamlar: GoTrue bazı kurulumlarda yalnızca rakam içeren local-part’ı reddeder.
 *
 * Domain önceliği:
 * 1. VITE_PHONE_AUTH_EMAIL_DOMAIN (env)
 * 2. Varsayılan: sefpos.com.tr
 *
 * NOT: Supabase Auth (GoTrue) yeni sürümleri MX kaydı olmayan domain'leri
 * "invalid email" olarak reddeder. Domain'in MX kaydı olmalı veya
 * Supabase Dashboard'da Auth → Email validation kapalı olmalı.
 */

const PHONE_AUTH_EMAIL_DOMAIN: string =
  ((import.meta as any)?.env?.VITE_PHONE_AUTH_EMAIL_DOMAIN as string | undefined)?.trim() || 'sefpos.com.tr';

export function normalizeTurkishMobileDigits(input: string): string {
  let d = String(input).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('05')) d = d.slice(1);
  return d;
}

export function phoneToAuthEmail(phoneOrDigits: string): string {
  const d = normalizeTurkishMobileDigits(phoneOrDigits);
  return `m${d}@${PHONE_AUTH_EMAIL_DOMAIN}`;
}

export function getPhoneAuthEmailDomain(): string {
  return PHONE_AUTH_EMAIL_DOMAIN;
}

/**
 * PIN → Supabase Auth password.
 * Supabase GoTrue minimum 6 karakter şartı koyduğu için 4 haneli PIN'i
 * deterministic prefix ile genişletiyoruz. Aynı PIN her zaman aynı parolayı
 * üretmeli (login + create iki yerde tutarlı).
 *
 * Format: `sefp_<pin_doldurulmus_8_hane>`
 */
export function pinToAuthPassword(pin: string): string {
  const digits = String(pin || '').replace(/\D/g, '');
  if (!digits) throw new Error('PIN bos olamaz');
  // 8 hane garanti et: kısa PIN ise tekrarla
  let padded = digits;
  while (padded.length < 8) padded = padded + digits;
  padded = padded.slice(0, 8);
  return `sefp_${padded}`;
}
