/** Header tek realtime kanal — App banner tekrar abone olmasin. */
export const SUPPORT_NOTIF_BANNER_EVENT = 'sefpos:support-notif-banner';

export type SupportNotifBannerDetail = {
  id: string;
  title: string;
  message: string;
  type: string;
};

export function dispatchSupportNotifBanner(detail: SupportNotifBannerDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUPPORT_NOTIF_BANNER_EVENT, { detail }));
}
