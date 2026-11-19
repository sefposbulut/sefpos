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

  // Web (tarayıcı) veya Electron dev (Vite http://localhost) — public/ kökte servis edilir.
  if (
    !isElectron ||
    (typeof window !== 'undefined' && /^https?:/i.test(window.location.protocol || ''))
  ) {
    return `/${clean}`;
  }

  // Electron production (file://…/dist/assets/index-xxx.js) → dist/logo.png
  // CRITICAL: do not use new URL(`../${clean}`, import.meta.url) without @vite-ignore.
  // Vite analyzes that template as "emit every file under src/" as static assets;
  // .ts then gets MIME video/mp2t and the web build breaks login (Failed to fetch).
  try {
    return new URL(/* @vite-ignore */ `../${clean}`, import.meta.url).href;
  } catch {
    return `./${clean}`;
  }
}
