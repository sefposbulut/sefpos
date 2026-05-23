import { APP_VERSION } from './appVersion';

/** Cloudflare Worker — `latest.yml` üzerinden son kuruluma yönlendirir. */
export const WINDOWS_SETUP_DOWNLOAD_PATH = '/download/setup';

export const WINDOWS_SETUP_FILENAME = 'Sefpos-Setup.exe';

const RELEASE_REPO = 'sefposbulut/sefpos-releases';

const PRODUCTION_ORIGIN = 'https://www.sefpos.com.tr';

/** GitHub Releases doğrudan dosya URL’si (yerel geliştirme yedek). */
export function githubDirectSetupDownloadUrl(version: string = APP_VERSION): string {
  const tag = version.startsWith('v') ? version : `v${version}`;
  const fileVersion = tag.replace(/^v/, '');
  return `https://github.com/${RELEASE_REPO}/releases/download/${tag}/Sefpos-Setup-${fileVersion}.exe`;
}

/** Kullanıcıya gösterilen indirme adresi — GitHub sayfası değil, doğrudan kurulum. */
export function windowsSetupDownloadHref(): string {
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return githubDirectSetupDownloadUrl();
    }
    return `${origin}${WINDOWS_SETUP_DOWNLOAD_PATH}`;
  }
  return `${PRODUCTION_ORIGIN}${WINDOWS_SETUP_DOWNLOAD_PATH}`;
}
