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

import {
  formatMoney,
  getActiveCurrencyCode,
  normalizeCurrencyCode,
  type TenantCurrencyCode,
} from './currency';

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
  discountPercent?: number | null;
  taxAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'credit_card' | 'open_account' | string;
  /** Müşteri adı (açık hesap vs.) — opsiyonel selamlama / fiş üstü. */
  customerName?: string | null;
  /**
   * Açık hesap (cari) için bakiye snapshot'ı.
   * - `previousBalance`: bu satıştan **önce**ki bakiye
   * - `newBalance`: bu satış işlendikten **sonra**ki bakiye
   * Tipik olarak `newBalance = previousBalance + total` olur ama bazen
   * indirim/kismi tahsil farkı için ayrı verilebilir.
   */
  previousBalance?: number | null;
  newBalance?: number | null;
  footer?: string | null;
  /** İşletme para birimi — verilmezse aktif tenant ayarı kullanılır. */
  currencyCode?: TenantCurrencyCode;
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

const resolveCurrency = (input: WhatsAppReceiptInput): TenantCurrencyCode =>
  normalizeCurrencyCode(input.currencyCode ?? getActiveCurrencyCode());

function fmtPercent(pct: number): string {
  return Number.isInteger(pct)
    ? String(pct)
    : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pct);
}

function methodLabel(m: string): string {
  if (m === 'cash')         return 'Nakit';
  if (m === 'credit_card')  return 'Kredi Kartı';
  if (m === 'open_account') return 'Açık Hesap';
  return 'Ödeme';
}

export function buildWhatsAppReceiptText(input: WhatsAppReceiptInput): string {
  const currency = resolveCurrency(input);
  const fmt = (n: number) => formatMoney(Number(n || 0), currency);
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
    lines.push(`   ${fmt(it.unitPrice)} → ${fmt(it.totalAmount)}`);
    if (it.notes) lines.push(`   Not: ${it.notes}`);
  }

  lines.push('--------------------------------');
  lines.push(`Ara toplam: ${fmt(input.subtotal)}`);
  if (input.discountAmount && input.discountAmount > 0) {
    const pct = Number(input.discountPercent || 0);
    const pctStr = pct > 0 ? fmtPercent(pct) : '';
    const pctLabel = pctStr ? ` (%${pctStr})` : '';
    lines.push(`İskonto${pctLabel}: -${fmt(input.discountAmount)}`);
  }
  if (input.taxAmount && input.taxAmount > 0) {
    lines.push(`KDV: ${fmt(input.taxAmount)}`);
  }
  lines.push(`*Toplam: ${fmt(input.total)}*`);
  lines.push(`Ödeme: ${methodLabel(input.paymentMethod)}`);

  // Cari (açık hesap) bilgisi — önceki ve yeni bakiye
  if (input.paymentMethod === 'open_account' && (
    typeof input.previousBalance === 'number' || typeof input.newBalance === 'number'
  )) {
    lines.push('--------------------------------');
    lines.push('CARİ HESAP');
    if (typeof input.previousBalance === 'number') {
      lines.push(`Önceki bakiye: ${fmt(input.previousBalance)}`);
    }
    if (typeof input.newBalance === 'number') {
      lines.push(`*Yeni bakiye:  ${fmt(input.newBalance)}*`);
    }
  }

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

/**
 * Termal fiş görüntüsü üretir — html2canvas ile PNG'ye basılmak üzere
 * tasarlanmış, beyaz arka planlı, monospace, ürünler arası ayırıcı çizgili,
 * gerçek bir fiş gibi görünen HTML döndürür. Tamamen self-contained (inline
 * style + class), izole render hedefine basılabilir.
 */
export function buildWhatsAppReceiptHtml(input: WhatsAppReceiptInput): string {
  const currency = resolveCurrency(input);
  const fmt = (n: number) => formatMoney(Number(n || 0), currency);
  const esc = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const date = new Date();
  const dateStr = date.toLocaleDateString('tr-TR');
  const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const css = `
    .wfis { width: 384px; box-sizing: border-box; background: #ffffff; color: #0f172a;
            padding: 20px 18px 24px 18px;
            font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px; line-height: 1.5; letter-spacing: 0; }
    .wfis * { box-sizing: border-box; }
    .wfis .center { text-align: center; }
    .wfis .bold { font-weight: 700; }
    .wfis .shop { font-size: 22px; font-weight: 800; letter-spacing: 0.2px; color: #0f172a; }
    .wfis .sub  { font-size: 12px; color: #475569; margin-top: 3px; }
    .wfis .meta { font-size: 13px; color: #1e293b; }
    .wfis .row  { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 1px 0; }
    .wfis .row  > span:first-child  { color: #475569; }
    .wfis .row  > span:last-child   { white-space: nowrap; color: #0f172a; font-weight: 600; }
    .wfis .hr-solid { border-top: 2px solid #0f172a; margin: 10px 0; }
    .wfis .hr-dash  { border-top: 1px dashed #94a3b8; margin: 8px 0; }
    .wfis .hr-thin  { border-top: 1px dashed #e2e8f0; margin: 6px 0; }
    .wfis .col-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 11px;
                      text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .wfis .item     { padding: 2px 0; }
    .wfis .item-name { font-weight: 600; font-size: 14px; color: #0f172a; }
    .wfis .item-line { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-top: 1px; }
    .wfis .item-line > span:last-child { font-weight: 700; color: #0f172a; }
    .wfis .item-note { font-size: 11px; color: #64748b; font-style: italic; padding-left: 4px; margin-top: 2px; }
    .wfis .total-row { display: flex; justify-content: space-between; align-items: center;
                       padding: 10px 12px; background: #0f172a; color: #ffffff; border-radius: 6px;
                       font-size: 17px; font-weight: 800; margin: 8px 0 6px 0; letter-spacing: 0.3px; }
    .wfis .footer   { text-align: center; margin-top: 10px; font-size: 12px; color: #475569; font-style: italic; }
    .wfis .disclaim { text-align: center; margin-top: 10px; font-size: 10px; color: #94a3b8;
                      letter-spacing: 0.3px; text-transform: uppercase; }
    .wfis .muted    { color: #94a3b8; font-weight: 500; font-size: 12px; }
    .wfis .discount > span:first-child { color: #b45309; font-weight: 700; }
    .wfis .discount > span:last-child  { color: #b45309; font-weight: 700; }
    .wfis .pay-method { font-weight: 700; color: #0f172a; }
    .wfis .balance-box   { border: 1px solid #0f172a; border-radius: 8px; padding: 10px 12px;
                           margin-top: 8px; background: #f8fafc; }
    .wfis .balance-title { font-weight: 700; font-size: 11px; letter-spacing: 1.5px;
                           text-align: center; margin-bottom: 6px; color: #0f172a; text-transform: uppercase; }
    .wfis .balance-new   { font-weight: 800; font-size: 15px; color: #b91c1c;
                           border-top: 1px dashed #cbd5e1; padding-top: 6px; margin-top: 6px; }
    .wfis .balance-new > span:last-child { color: #b91c1c; }
  `;

  let html = `<style>${css}</style><div class="wfis">`;

  html += `<div class="center">
    <div class="shop">${esc(input.restaurantName || 'ŞefPOS')}</div>
    ${input.restaurantAddress ? `<div class="sub">${esc(input.restaurantAddress)}</div>` : ''}
    ${input.restaurantPhone   ? `<div class="sub">Tel: ${esc(input.restaurantPhone)}</div>` : ''}
  </div>`;

  html += `<div class="hr-solid"></div>`;

  html += `<div class="meta">
    <div class="row"><span>Tarih</span><span>${dateStr} ${timeStr}</span></div>
    <div class="row"><span>Sipariş No</span><span class="bold">#${esc(input.orderNumber)}</span></div>
    ${input.tableLabel ? `<div class="row"><span>Yer</span><span>${esc(input.tableLabel)}</span></div>` : ''}
    ${input.customerName ? `<div class="row"><span>Müşteri</span><span>${esc(input.customerName)}</span></div>` : ''}
  </div>`;

  html += `<div class="hr-solid"></div>`;

  html += `<div class="col-head"><span>Ürün</span><span>Tutar</span></div>`;
  html += `<div class="hr-dash"></div>`;

  const items = Array.isArray(input.items) ? input.items : [];
  items.forEach((it, idx) => {
    const name = it.variantName ? `${it.productName} (${it.variantName})` : it.productName;
    html += `<div class="item">
      <div class="item-name">${esc(name)}</div>
      <div class="item-line">
        <span>${it.quantity} × ${fmt(it.unitPrice)}</span>
        <span>${fmt(it.totalAmount)}</span>
      </div>
      ${it.notes ? `<div class="item-note">Not: ${esc(it.notes)}</div>` : ''}
    </div>`;
    if (idx < items.length - 1) {
      html += `<div class="hr-thin"></div>`;
    }
  });

  html += `<div class="hr-dash"></div>`;
  html += `<div class="row"><span>Ara Toplam</span><span>${fmt(input.subtotal)}</span></div>`;
  if (input.discountAmount && input.discountAmount > 0) {
    const pct = Number(input.discountPercent || 0);
    const pctStr = pct > 0 ? fmtPercent(pct) : '';
    const pctLabel = pctStr ? ` <span class="muted">(%${pctStr})</span>` : '';
    html += `<div class="row discount"><span>İskonto${pctLabel}</span><span>-${fmt(input.discountAmount)}</span></div>`;
  }
  if (input.taxAmount && input.taxAmount > 0) {
    html += `<div class="row"><span>KDV</span><span>${fmt(input.taxAmount)}</span></div>`;
  }
  html += `<div class="total-row"><span>TOPLAM</span><span>${fmt(input.total)}</span></div>`;
  html += `<div class="row"><span>Ödeme</span><span class="pay-method">${esc(methodLabel(input.paymentMethod))}</span></div>`;

  // Cari (açık hesap) bakiye kutusu — sadece open_account ödemelerinde gösterilir.
  if (
    input.paymentMethod === 'open_account' &&
    (typeof input.previousBalance === 'number' || typeof input.newBalance === 'number')
  ) {
    html += `<div class="hr-dash"></div>`;
    html += `<div class="balance-box">`;
    html += `<div class="balance-title">CARİ HESAP</div>`;
    if (typeof input.previousBalance === 'number') {
      html += `<div class="row"><span>Önceki Bakiye</span><span>${fmt(input.previousBalance)}</span></div>`;
    }
    if (typeof input.newBalance === 'number') {
      html += `<div class="row balance-new"><span>Yeni Bakiye</span><span>${fmt(input.newBalance)}</span></div>`;
    }
    html += `</div>`;
  }

  html += `<div class="hr-dash"></div>`;
  html += `<div class="footer">${esc(input.footer || 'Teşekkürler, iyi günler!')}</div>`;
  html += `<div class="disclaim">Bilgi fişidir. Mali değeri yoktur.</div>`;

  html += `</div>`;
  return html;
}
