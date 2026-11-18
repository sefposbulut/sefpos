/**
 * Windows kurulum ve yazıcı ajanı indirme — aynı origin (`/download/...`).
 * Dosya VDS `httpdocs/download` altında gerçek EXE olarak durmalı;
 * SPA fallback yalnızca dosya yoksa index.html döner.
 */
export const WINDOWS_SETUP_DOWNLOAD_PATH = '/download/Sefpos-Setup.exe';

export const WINDOWS_SETUP_FILENAME = 'Sefpos-Setup.exe';

/** Web-only yazıcı köprüsü (Electron istemeyen kasalar). Ürün adı: ŞefPOS Yazıcı Ajanı */
export const PRINT_AGENT_DOWNLOAD_PATH = '/download/Sefpos-PrintAgent.exe';
export const PRINT_AGENT_FILENAME = 'Sefpos-PrintAgent.exe';
export const PRINT_AGENT_PRODUCT_NAME = 'ŞefPOS Yazıcı Ajanı';

const PRODUCTION_ORIGIN = 'https://www.sefpos.com.tr';

/** Kurulum EXE — aynı origin `/download/Sefpos-Setup.exe`. */
export function windowsSetupDownloadHref(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${WINDOWS_SETUP_DOWNLOAD_PATH}`;
  }
  return `${PRODUCTION_ORIGIN}${WINDOWS_SETUP_DOWNLOAD_PATH}`;
}

/** Eski uyumluluk — tıklamada yönlendirme yok; `<a href>` doğrudan EXE. */
export function onWindowsSetupDownloadClick(
  _e?: { preventDefault?: () => void },
): void {
  /* no-op: href=/download/Sefpos-Setup.exe */
}

/** ŞefPOS Yazıcı Ajanı EXE — aynı origin `/download/...` (VDS / Pages). */
export function printAgentDownloadHref(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${PRINT_AGENT_DOWNLOAD_PATH}`;
  }
  return `${PRODUCTION_ORIGIN}${PRINT_AGENT_DOWNLOAD_PATH}`;
}
