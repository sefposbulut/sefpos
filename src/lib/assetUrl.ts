/**
 * Electron'da `<img src="/logo.png" />` `file:///C:/logo.png` olarak çözülüp 404 verir
 * (file:// protokolünde "/" kökü diskin kökü). Web/Cloudflare'de ise "/logo.png"
 * doğru çözülür. Bu yardımcı, ortama göre doğru URL'i döner.
 *
 * Kullanım:
 *   import { publicAsset } from '@/lib/assetUrl';
 *   <img src={publicAsset('logo.png')} />
 */

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

export function publicAsset(name: string): string {
  const clean = name.replace(/^\/+/, '');
  if (isElectron) {
    return new URL(`../../public/${clean}`, import.meta.url).href;
  }
  return `/${clean}`;
}
