/**
 * Yazdırma katmanı için global toast yardımcıları.
 *
 * Niye custom event? UI tarafında zaten kullanılan bir global toast lib yok ve
 * `printService.ts` çağrıları (mutfak, adisyon, paket) UI ağacının dışından da
 * tetikleniyor (örn. `queueMicrotask`, optimistic flow). Window event'i sayesinde
 * tek bir mount edilmiş toast bileşeni tüm yazdırma sonuçlarını gösterebiliyor.
 *
 * Kullanım:
 *   dispatchPrintToast({ kind: 'success', message: 'Mutfak fişi gönderildi', target: 'EPSON' });
 *   dispatchPrintToast({ kind: 'error', message: 'Yazıcıya ulaşılamadı', detail: '...' });
 */

export type PrintToastKind = 'success' | 'queued' | 'error';

export interface PrintToastDetail {
  kind: PrintToastKind;
  /** Kısa başlık. Örn: "Mutfak fişi yazdırıldı" */
  message: string;
  /** Hedef yazıcı ya da kuyruk adı (opsiyonel sub-text) */
  target?: string;
  /** Hata gerekçesi vs. */
  detail?: string;
  /** Otomatik kapanma süresi (ms). Verilmezse `kind`'a göre varsayılan kullanılır. */
  durationMs?: number;
}

export const PRINT_TOAST_EVENT = 'sefpos:print-toast';

export function dispatchPrintToast(detail: PrintToastDetail): void {
  try {
    window.dispatchEvent(new CustomEvent<PrintToastDetail>(PRINT_TOAST_EVENT, { detail }));
  } catch {
    // SSR / test ortamı vs.
  }
}
