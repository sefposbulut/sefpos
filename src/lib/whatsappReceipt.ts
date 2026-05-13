/**
 * WhatsApp üzerinden fiş paylaşımı yardımcıları.
 *
 * - `formatPhoneForWhatsApp` Türkiye formatlı numarayı uluslararası
 *   (`90...`) hâle getirir; örn. `0532 517 80 50` → `905325178050`.
 * - `buildWhatsAppReceiptText` POS'tan dönen kalemleri sade metin fiş hâline getirir.
 * - `openWhatsAppWithReceipt` masaüstü/web tarayıcıda `wa.me/...` linkini açar
 *   (Electron varsa harici tarayıcıda); kullanıcı WhatsApp Web/Mobile üzerinden
 *   tek tıkla gönderir.
 */

export interface WhatsAppReceiptInput {
  restaurantName: string;
  restaurantPhone?: string | null;
  restaurantAddress?: string | null;
  tableLabel?: string | null;
  orderNumber: string;
  items: Array<{
    productName: string;
    variantName?: string | null;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    notes?: string | null;
  }>;
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'credit_card' | 'open_account' | string;
  /** Müşteri adı (açık hesap vs.) — opsiyonel selamlama. */
  customerName?: string | null;
  footer?: string | null;
}

/** "0532 517 80 50" / "+90 532 ..." → "905325178050" */
export function formatPhoneForWhatsApp(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('90') && digits.length === 12) return digits;
  if (digits.startsWith('0')  && digits.length === 11) return '9' + digits;
  if (digits.length === 10) return '90' + digits;
  if (digits.startsWith('90')) return digits;
  return digits;
}

const fmtTry = (n: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

function methodLabel(m: string): string {
  if (m === 'cash')         return 'Nakit';
  if (m === 'credit_card')  return 'Kredi Kartı';
  if (m === 'open_account') return 'Açık Hesap';
  return 'Ödeme';
}

export function buildWhatsAppReceiptText(input: WhatsAppReceiptInput): string {
  const lines: string[] = [];
  lines.push(`*${input.restaurantName}*`);
  if (input.restaurantPhone)   lines.push(`Tel: ${input.restaurantPhone}`);
  if (input.restaurantAddress) lines.push(input.restaurantAddress);
  lines.push('');

  if (input.customerName) lines.push(`Sayın ${input.customerName},`);
  lines.push(`Sipariş No: *#${input.orderNumber}*`);
  if (input.tableLabel) lines.push(`Yer: ${input.tableLabel}`);
  lines.push(`Tarih: ${new Date().toLocaleString('tr-TR')}`);
  lines.push('--------------------------------');

  for (const it of input.items) {
    const name = it.variantName ? `${it.productName} (${it.variantName})` : it.productName;
    lines.push(`${it.quantity} x ${name}`);
    lines.push(`   ${fmtTry(it.unitPrice)} → ${fmtTry(it.totalAmount)} ₺`);
    if (it.notes) lines.push(`   Not: ${it.notes}`);
  }

  lines.push('--------------------------------');
  lines.push(`Ara toplam: ${fmtTry(input.subtotal)} ₺`);
  if (input.discountAmount && input.discountAmount > 0) {
    lines.push(`İndirim: -${fmtTry(input.discountAmount)} ₺`);
  }
  if (input.taxAmount && input.taxAmount > 0) {
    lines.push(`KDV: ${fmtTry(input.taxAmount)} ₺`);
  }
  lines.push(`*Toplam: ${fmtTry(input.total)} ₺*`);
  lines.push(`Ödeme: ${methodLabel(input.paymentMethod)}`);

  if (input.footer) {
    lines.push('');
    lines.push(input.footer);
  }
  lines.push('');
  lines.push('Teşekkürler! ');
  return lines.join('\n');
}

/**
 * `wa.me` linkini açar. Telefon boşsa numara seçim ekranı çıkar
 * (`https://wa.me/?text=...`), aksi halde doğrudan o numara için sohbet.
 *
 * Electron `main.cjs` içindeki `setWindowOpenHandler` yeni pencere isteklerini
 * yakalayıp varsayılan tarayıcıda açar — yani web ve Electron'da aynı çağrı çalışır.
 */
export function openWhatsAppWithReceipt(phone: string | null, text: string): void {
  const formatted = phone ? formatPhoneForWhatsApp(phone) : null;
  const url = formatted
    ? `https://wa.me/${formatted}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
