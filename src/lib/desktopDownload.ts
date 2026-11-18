import { APP_VERSION } from './appVersion';

/**
 * Not: www.sefpos.com.tr şu an VDS (IIS/Plesk) üzerinde.
 * Cloudflare Pages `_worker.js` buradaki `/download/setup` yolunu
 * yakalamaz; IIS SPA index.html (~8 KB) döner. Tarayıcı bunu
 * `download="Sefpos-Setup.exe"` ile EXE diye kaydedince Windows
 * "dosya bozuk" der.
 *
 * Bu yüzden indirme **doğrudan GitHub Releases** üzerinden yapılır.
 */
export const WINDOWS_SETUP_DOWNLOAD_PATH = '/download/setup';

export const WINDOWS_SETUP_FILENAME = 'Sefpos-Setup.exe';

/** Web-only yazıcı köprüsü (Electron istemeyen kasalar). Ürün adı: ŞefPOS Yazıcı Ajanı */
export const PRINT_AGENT_DOWNLOAD_PATH = '/download/Sefpos-PrintAgent.exe';
export const PRINT_AGENT_FILENAME = 'Sefpos-PrintAgent.exe';
export const PRINT_AGENT_PRODUCT_NAME = 'ŞefPOS Yazıcı Ajanı';

const RELEASE_REPO = 'sefposbulut/sefpos-releases';
const PRODUCTION_ORIGIN = 'https://www.sefpos.com.tr';

export const RELEASE_LATEST_YML_URL =
  `https://github.com/${RELEASE_REPO}/releases/latest/download/latest.yml`;

export const RELEASE_LATEST_DOWNLOAD_BASE =
  `https://github.com/${RELEASE_REPO}/releases/latest/download/`;

/** Releases sayfası — JS çalışmazsa yedek. */
export const RELEASE_LATEST_PAGE_URL =
  `https://github.com/${RELEASE_REPO}/releases/latest`;

/** GitHub Releases doğrudan dosya URL’si (bilinen sürüm). */
export function githubDirectSetupDownloadUrl(version: string = APP_VERSION): string {
  const tag = version.startsWith('v') ? version : `v${version}`;
  const fileVersion = tag.replace(/^v/, '');
  return `https://github.com/${RELEASE_REPO}/releases/download/${tag}/Sefpos-Setup-${fileVersion}.exe`;
}

/** latest.yml içinden kurulum dosya adını oku. */
export async function resolveLatestWindowsSetupUrl(): Promise<string> {
  const res = await fetch(RELEASE_LATEST_YML_URL, {
    cache: 'no-store',
    headers: { Accept: 'text/yaml,text/plain,*/*' },
  });
  if (!res.ok) {
    throw new Error(`latest.yml HTTP ${res.status}`);
  }
  const yaml = await res.text();
  const match = yaml.match(/^path:\s*(\S+)\s*$/m);
  const name = match?.[1]?.trim();
  if (!name) throw new Error('latest.yml path missing');
  return `${RELEASE_LATEST_DOWNLOAD_BASE}${encodeURIComponent(name)}`;
}

/**
 * Kullanıcıya gösterilen yedek href (JS yoksa Releases sayfası).
 * Gerçek EXE indirme için `startWindowsSetupDownload` kullanın.
 */
export function windowsSetupDownloadHref(): string {
  return RELEASE_LATEST_PAGE_URL;
}

/** Buton tıklanınca: latest.yml → gerçek EXE URL → indir. */
export async function startWindowsSetupDownload(): Promise<void> {
  try {
    const url = await resolveLatestWindowsSetupUrl();
    window.location.assign(url);
  } catch (err) {
    console.warn('[ŞefPOS] Kurulum URL çözülemedi, Releases sayfasına gidiliyor:', err);
    window.location.assign(RELEASE_LATEST_PAGE_URL);
  }
}

/** `<a onClick={...}>` için — aynı sekmede EXE indirmeyi başlatır. */
export function onWindowsSetupDownloadClick(
  e: { preventDefault: () => void },
): void {
  e.preventDefault();
  void startWindowsSetupDownload();
}

/** ŞefPOS Yazıcı Ajanı EXE — aynı origin `/download/...` (VDS / Pages). */
export function printAgentDownloadHref(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${PRINT_AGENT_DOWNLOAD_PATH}`;
  }
  return `${PRODUCTION_ORIGIN}${PRINT_AGENT_DOWNLOAD_PATH}`;
}
