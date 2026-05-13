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
    const pctLabel = input.discountPercent && input.discountPercent > 0
      ? ` (%${input.discountPercent})`
      : '';
    lines.push(`İndirim${pctLabel}: -${fmtTry(input.discountAmount)} ₺`);
  }
  if (input.taxAmount && input.taxAmount > 0) {
    lines.push(`KDV: ${fmtTry(input.taxAmount)} ₺`);
  }
  lines.push(`*Toplam: ${fmtTry(input.total)} ₺*`);
  lines.push(`Ödeme: ${methodLabel(input.paymentMethod)}`);

  // Cari (açık hesap) bilgisi — önceki ve yeni bakiye
  if (input.paymentMethod === 'open_account' && (
    typeof input.previousBalance === 'number' || typeof input.newBalance === 'number'
  )) {
    lines.push('--------------------------------');
    lines.push('CARİ HESAP');
    if (typeof input.previousBalance === 'number') {
      lines.push(`Önceki bakiye: ${fmtTry(input.previousBalance)} ₺`);
    }
    if (typeof input.newBalance === 'number') {
      lines.push(`*Yeni bakiye:  ${fmtTry(input.newBalance)} ₺*`);
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
    .wfis { width: 360px; box-sizing: border-box; background: #ffffff; color: #111; padding: 18px 16px 22px 16px;
            font-family: 'Courier New', ui-monospace, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.45; }
    .wfis * { box-sizing: border-box; }
    .wfis .center { text-align: center; }
    .wfis .bold { font-weight: 800; }
    .wfis .shop { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
    .wfis .sub  { font-size: 11px; color: #444; margin-top: 2px; }
    .wfis .meta { font-size: 12px; color: #222; }
    .wfis .row  { display: flex; justify-content: space-between; gap: 8px; }
    .wfis .row  > span:last-child { white-space: nowrap; }
    .wfis .hr-solid  { border-top: 2px solid #111; margin: 8px 0; }
    .wfis .hr-dash   { border-top: 1px dashed #333; margin: 6px 0; }
    .wfis .hr-thin   { border-top: 1px dashed #bbb; margin: 5px 0; }
    .wfis .col-head  { display: flex; justify-content: space-between; font-weight: 800;
                       font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .wfis .item-name { font-weight: 700; font-size: 13px; }
    .wfis .item-line { display: flex; justify-content: space-between; font-size: 12px; color: #333; }
    .wfis .item-note { font-size: 11px; color: #555; padding-left: 10px; }
    .wfis .total-row { display: flex; justify-content: space-between; align-items: baseline;
                       padding: 6px 8px; background: #111; color: #fff; border-radius: 4px;
                       font-size: 16px; font-weight: 900; margin: 6px 0; }
    .wfis .footer    { text-align: center; margin-top: 8px; font-size: 12px; font-style: italic; }
    .wfis .disclaim  { text-align: center; margin-top: 10px; font-size: 10px; color: #666; letter-spacing: 0.5px; }
    .wfis .badge     { display: inline-block; padding: 2px 8px; border: 1px solid #111;
                       border-radius: 999px; font-size: 11px; font-weight: 700; }
    .wfis .muted     { color: #777; font-weight: 400; font-size: 11px; }
    .wfis .discount  { color: #b45309; font-weight: 700; }
    .wfis .balance-box { border: 1.5px solid #111; border-radius: 6px; padding: 8px 10px; margin-top: 6px; background: #fafafa; }
    .wfis .balance-title { font-weight: 900; font-size: 11px; letter-spacing: 1px;
                           text-align: center; margin-bottom: 4px; color: #111; }
    .wfis .balance-new { font-weight: 900; font-size: 14px; color: #b91c1c;
                         border-top: 1px dashed #aaa; padding-top: 4px; margin-top: 4px; }
  `;

  const fmt = (n: number) => fmtTry(n);

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
    html += `<div>
      <div class="item-name">${esc(name)}</div>
      <div class="item-line">
        <span>${it.quantity} × ${fmt(it.unitPrice)} ₺</span>
        <span class="bold">${fmt(it.totalAmount)} ₺</span>
      </div>
      ${it.notes ? `<div class="item-note">Not: ${esc(it.notes)}</div>` : ''}
    </div>`;
    if (idx < items.length - 1) {
      html += `<div class="hr-thin"></div>`;
    }
  });

  html += `<div class="hr-dash"></div>`;
  html += `<div class="row"><span>Ara Toplam</span><span>${fmt(input.subtotal)} ₺</span></div>`;
  if (input.discountAmount && input.discountAmount > 0) {
    const pctLabel = input.discountPercent && input.discountPercent > 0
      ? ` <span class="muted">(%${input.discountPercent})</span>`
      : '';
    html += `<div class="row discount"><span>İndirim${pctLabel}</span><span>-${fmt(input.discountAmount)} ₺</span></div>`;
  }
  if (input.taxAmount && input.taxAmount > 0) {
    html += `<div class="row"><span>KDV</span><span>${fmt(input.taxAmount)} ₺</span></div>`;
  }
  html += `<div class="total-row"><span>TOPLAM</span><span>${fmt(input.total)} ₺</span></div>`;
  html += `<div class="row"><span>Ödeme</span><span class="badge">${esc(methodLabel(input.paymentMethod))}</span></div>`;

  // Cari (açık hesap) bakiye kutusu — sadece open_account ödemelerinde gösterilir.
  if (
    input.paymentMethod === 'open_account' &&
    (typeof input.previousBalance === 'number' || typeof input.newBalance === 'number')
  ) {
    html += `<div class="hr-dash"></div>`;
    html += `<div class="balance-box">`;
    html += `<div class="balance-title">CARİ HESAP</div>`;
    if (typeof input.previousBalance === 'number') {
      html += `<div class="row"><span>Önceki Bakiye</span><span>${fmt(input.previousBalance)} ₺</span></div>`;
    }
    if (typeof input.newBalance === 'number') {
      html += `<div class="row balance-new"><span>Yeni Bakiye</span><span>${fmt(input.newBalance)} ₺</span></div>`;
    }
    html += `</div>`;
  }

  html += `<div class="hr-dash"></div>`;
  html += `<div class="footer">${esc(input.footer || 'Teşekkürler, iyi günler!')}</div>`;
  html += `<div class="disclaim">Bilgi fişidir. Mali değeri yoktur.</div>`;

  html += `</div>`;
  return html;
}
