/**
 * Oztek SMS HTTP API (smsgonder1Npost).
 * Secrets: Dashboard → Edge Functions → OZTEK_KULLANICINO, OZTEK_KULLANICIADI, OZTEK_SIFRE
 * İsteğe bağlı: OZTEK_ORGINATOR, OZTEK_SMS_ENDPOINT
 */

export function getOztekConfig() {
  return {
    endpoint: Deno.env.get('OZTEK_SMS_ENDPOINT') || 'http://www.oztekbayi.com/panel/smsgonder1Npost.php',
    kullanicino: (Deno.env.get('OZTEK_KULLANICINO') || '').trim(),
    kullaniciadi: (Deno.env.get('OZTEK_KULLANICIADI') || '').trim(),
    sifre: (Deno.env.get('OZTEK_SIFRE') || '').trim(),
    orjinator: (Deno.env.get('OZTEK_ORGINATOR') || 'AYKA SOFT').trim(),
  };
}

export function assertOztekConfigured(): void {
  const c = getOztekConfig();
  if (!c.kullanicino || !c.kullaniciadi || !c.sifre) {
    throw new Error(
      'Oztek SMS ayarlari eksik. Supabase Dashboard → Edge Functions → Secrets: OZTEK_KULLANICINO, OZTEK_KULLANICIADI, OZTEK_SIFRE tanimlayin (Oztek panel ile ayni olmali).',
    );
  }
}

/** Oztek yanit: basari "1:..." */
export function assertOztekSuccess(rawResult: string, contextLabel: string): void {
  const raw = rawResult.trim();
  if (raw.startsWith('1:')) return;
  if (!raw) throw new Error(`${contextLabel}: SMS servis yaniti bos`);
  let extra = '';
  const lower = raw.toLowerCase();
  if (raw.startsWith('2:') && (lower.includes('kullanici') || lower.includes('kullanıcı'))) {
    extra =
      ' Oztek "kullanici bulunamadi": kullanici no / adi / sifre hatali veya Edge secret baska hesaba ait. Oztek panel giris bilgilerinizi Secrets’a aynen yazin.';
  }
  throw new Error(`${contextLabel}: ${raw}${extra}`);
}

export async function postOztekSms(phone: string, message: string, contextLabel = 'SMS'): Promise<void> {
  assertOztekConfigured();
  const c = getOztekConfig();
  const body = `data=<sms><kno>${c.kullanicino}</kno><kulad>${c.kullaniciadi}</kulad><sifre>${c.sifre}</sifre><gonderen>${c.orjinator}</gonderen><mesaj>${message}</mesaj><numaralar>${phone}</numaralar><tur>Turkce</tur></sms>`;
  const res = await fetch(c.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${contextLabel} HTTP: ${res.status}`);
  assertOztekSuccess(text.trim(), contextLabel);
}
