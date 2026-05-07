/**
 * Garson cihazı: bağlama sırasında kaydedilen genel IP /24 öneki ile
 * şu anki çıkış IP'sini karşılaştırır (işyeri dışı erişimi keser).
 */

export async function getPublicIpQuick(): Promise<string> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    return (data?.ip as string) || '';
  } catch {
    return '';
  }
}

export function ipv4ToThreeOctetPrefix(ip: string): string {
  const parts = (ip || '').split('.');
  if (parts.length !== 4) return '';
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export async function checkRestaurantIpGate(
  bindingAllowedPrefix: string | null | undefined,
  fallbackDeviceInfo: Record<string, unknown> | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const bindP = String(bindingAllowedPrefix || '').trim();
  const info = fallbackDeviceInfo || {};
  const reqP = String((info as any).ipPrefix || (info as any).ip_prefix || '').trim();
  const lockMode = String((info as any).lockMode || (info as any).lock_mode || '');
  const effective = bindP || reqP;
  const shouldEnforce = bindP.length > 0 || lockMode === 'ip_prefix' || reqP.length > 0;
  if (!shouldEnforce) return { ok: true };
  if (!effective) return { ok: true };

  const currentIp = await getPublicIpQuick();
  const cur = ipv4ToThreeOctetPrefix(currentIp);
  if (!cur || cur !== effective) {
    return {
      ok: false,
      message:
        'Bu cihaz yalnızca restoranda (bağlama isteğini gönderdiğiniz internet çıkışında) kullanılabilir. ' +
        'Ev veya farklı bir ağdaysanız oturum kapatılır.',
    };
  }
  return { ok: true };
}
