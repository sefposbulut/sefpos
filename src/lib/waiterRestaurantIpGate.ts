/**
 * Garson cihazı: bağlama sırasında kaydedilen genel IP /24 öneki ile
 * şu anki çıkış IP'sini karşılaştırır. Eşleşmezse oturum açılmaz veya
 * çalışan oturum sonlandırılır (mobil veri / ev WiFi gibi yetkisiz ağları engeller).
 */

import { isSqlServerMode } from './sqlDb';

const IP_LOOKUP_ENDPOINTS = [
  'https://api.ipify.org?format=json',
  'https://api64.ipify.org?format=json',
];

export async function getPublicIpQuick(): Promise<string> {
  for (const url of IP_LOOKUP_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const ip = (data?.ip as string) || '';
      if (ip) return ip;
    } catch {
      /* try next */
    }
  }
  return '';
}

export function ipv4ToThreeOctetPrefix(ip: string): string {
  const parts = (ip || '').split('.');
  if (parts.length !== 4) return '';
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export type IpGateResult =
  | { ok: true }
  | { ok: false; reason: 'no_lock' | 'no_internet' | 'mismatch'; message: string };

/**
 * Cihazda kayıtlı IP /24 öneki ile mevcut çıkış IP'sini kıyaslar.
 *
 * - bindingAllowedPrefix: device_bindings.allowed_ip_prefix (öncelikli)
 * - fallbackDeviceInfo: device_binding_requests.device_info (geri uyumluluk)
 *
 * Eski kayıtlarda prefix hiç olmayabilir; bu durumda kapı **kapalı** kabul edilir
 * ve garsondan yeniden bağlama isteği göndermesi istenir. Aksi halde IP kilidi
 * devre dışı kalır ve mobil veride de erişim mümkün olur.
 */
export async function checkRestaurantIpGate(
  bindingAllowedPrefix: string | null | undefined,
  fallbackDeviceInfo: Record<string, unknown> | null | undefined,
): Promise<IpGateResult> {
  if (isSqlServerMode()) return { ok: true };

  const bindP = String(bindingAllowedPrefix || '').trim();
  const info = fallbackDeviceInfo || {};
  const reqP = String((info as any).ipPrefix || (info as any).ip_prefix || '').trim();
  const effective = bindP || reqP;

  if (!effective) {
    return {
      ok: false,
      reason: 'no_lock',
      message:
        'Bu cihaz için ağ kilidi kayıtlı değil. Lütfen restoran Wi-Fi’sine bağlanıp ' +
        'yeniden bağlama isteği gönderin.',
    };
  }

  const currentIp = await getPublicIpQuick();
  const cur = ipv4ToThreeOctetPrefix(currentIp);
  if (!cur) {
    return {
      ok: false,
      reason: 'no_internet',
      message:
        'Genel IP doğrulanamadı. İnternet bağlantınızı kontrol edin (mobil veri kapalı, ' +
        'restoran Wi-Fi açık olmalı).',
    };
  }
  if (cur !== effective) {
    return {
      ok: false,
      reason: 'mismatch',
      message:
        'Bu cihaz yalnızca restoran ağında kullanılabilir. ' +
        `Mevcut ağ: ${cur}.x  •  Yetkili ağ: ${effective}.x`,
    };
  }
  return { ok: true };
}
