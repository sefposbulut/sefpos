/**
 * Yemeksepeti / Trendyol / Migros (DH bazlı platformlar) için **eksiksiz**
 * mutfak + paket fişi HTML üretici.
 *
 * Tek kaynak: `yemeksepeti-webhook` ilk basımda kullanır, ŞefPOS reprint
 * akışında da aynı fonksiyon `print_jobs` kuyruğuna atar. Böylece müşteriye /
 * mutfağa giden fişin görüntüsü daima birbiriyle aynıdır.
 *
 * Yemeksepeti'nin sözleşmesinde dayatılan bir fiş şablonu yoktur; ancak
 * partner panelinde gösterdiği "sipariş kartı" düzenini takip eder:
 *
 *   Platform başlığı (Yemeksepeti / Trendyol / Migros)
 *   Sipariş kısa kodu (büyük ve kutuda)
 *   Sipariş zamanı, tipi (Gel-al / Teslimat), ödeme durumu
 *   Müşteri kutusu: ad, telefon, e-posta
 *   Teslimat adresi: cadde, no, bina, kat, daire, intercom, mahalle, ilçe, posta kodu,
 *                    enlem/boylam, kurye yönergesi
 *   Pickup kutusu: pickupCode + pickupTime
 *   Müşteri yorumu (varsa, dikkat çekici sarı kutu)
 *   Ürünler:
 *     - X adet ürün adı  →  fiyat
 *     - alttan girintili topping/varyant satırları (her biri ayrı satır)
 *     - ürün notu (italik küçük punto)
 *   Toplam tablosu (alt toplam, indirim, teslimat ücreti, KDV, KDV dahil toplam)
 *   Tip + komisyon notu (opsiyonel)
 *   Tarih + footer
 */

export interface DHToppingForReceipt {
  name: string;
  quantity?: number | string;
  price?: string | number | null;
  children?: DHToppingForReceipt[];
}

export interface DHProductForReceipt {
  name: string;
  quantity: number | string;
  unitPrice?: string | number | null;
  paidPrice?: string | number | null;
  comment?: string | null;
  remoteCode?: string | null;
  sku?: string | null;
  categoryName?: string | null;
  selectedToppings?: DHToppingForReceipt[];
}

export interface DHReceiptOrderInput {
  platformLabel: string;
  /** Yemeksepeti shortCode / Trendyol order code. */
  orderCode: string;
  /** Asıl uzun token; debug için en alta küçük punto basılır. */
  orderToken?: string | null;
  createdAt?: string | null;
  expeditionType?: "pickup" | "delivery" | string | null;
  isPaid?: boolean;
  paymentType?: string | null;
  testOrder?: boolean;
  preOrder?: boolean;

  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    mobilePhone?: string | null;
    email?: string | null;
  };

  delivery?: {
    address?: {
      street?: string | null;
      number?: string | null;
      building?: string | null;
      floor?: string | null;
      flatNumber?: string | null;
      intercom?: string | null;
      city?: string | null;
      postcode?: string | null;
      deliveryArea?: string | null;
      deliveryMainArea?: string | null;
      deliveryInstructions?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    expectedDeliveryTime?: string | null;
    expressDelivery?: boolean;
    riderPickupTime?: string | null;
  } | null;

  pickup?: {
    pickupTime?: string | null;
    pickupCode?: string | null;
  } | null;

  customerComment?: string | null;
  vendorComment?: string | null;

  /** Getir sipariş doğrulama kodu (örn. h593) — fiş üstünde büyük kutu. */
  verificationCode?: string | null;
  /** Getir ortak kampanya / restoran destekli indirim. */
  ortakKampanya?: boolean;
  /** Kurye tipi rozeti: Getir Getirsin / Restoran Getirsin. */
  courierBadge?: string | null;

  products: DHProductForReceipt[];

  totals: {
    grandTotal: number;
    subTotal?: number;
    vatTotal?: number;
    deliveryFee?: number;
    discountTotal?: number;
    riderTip?: number;
  };
}

function escHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtTL(v: number | undefined | null): string {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  return `${n.toFixed(2)} TL`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleString("tr-TR");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("tr-TR");
}

function buildAddressLines(d: DHReceiptOrderInput["delivery"]): string[] {
  const a = d?.address;
  if (!a) return [];
  const line1Parts = [
    a.street,
    a.number ? `No: ${a.number}` : null,
  ].filter(Boolean) as string[];
  const buildingParts = [
    a.building ? `Bina: ${a.building}` : null,
    a.floor ? `Kat: ${a.floor}` : null,
    a.flatNumber ? `Daire: ${a.flatNumber}` : null,
    a.intercom ? `Zil: ${a.intercom}` : null,
  ].filter(Boolean) as string[];
  const areaParts = [
    a.deliveryArea,
    a.deliveryMainArea,
    a.city,
    a.postcode,
  ].filter(Boolean) as string[];
  const lines: string[] = [];
  if (line1Parts.length) lines.push(line1Parts.join(" "));
  if (buildingParts.length) lines.push(buildingParts.join(" • "));
  if (areaParts.length) lines.push(areaParts.join(", "));
  if (a.deliveryInstructions) lines.push(`Yönerge: ${a.deliveryInstructions}`);
  return lines;
}

function buildToppingLines(toppings: DHToppingForReceipt[] | undefined, depth = 1): string {
  if (!toppings || toppings.length === 0) return "";
  let out = "";
  for (const t of toppings) {
    const qty = Number(t.quantity) > 0 ? `${t.quantity}x ` : "";
    const indent = "&nbsp;&nbsp;".repeat(depth) + "↳ ";
    out += `<div class="topping" style="padding-left:${depth * 6}px">${indent}${qty}${escHtml(t.name)}</div>`;
    if (t.children && t.children.length > 0) {
      out += buildToppingLines(t.children, depth + 1);
    }
  }
  return out;
}

export function renderDHOrderReceiptHtml(order: DHReceiptOrderInput): string {
  const platformLabel = (order.platformLabel || "Online").toUpperCase();
  const customerFull =
    (order.customer?.fullName ||
      [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") ||
      "Müşteri").trim();
  const phone = order.customer?.mobilePhone || "";
  const email = order.customer?.email || "";

  const isDelivery = (order.expeditionType || "delivery") === "delivery";
  const addressLines = isDelivery ? buildAddressLines(order.delivery) : [];

  const pickupCode = order.pickup?.pickupCode || "";
  const pickupTime = order.pickup?.pickupTime || "";

  const orderCode = order.orderCode || "";
  const orderToken = order.orderToken || "";

  const productsHtml = (order.products || [])
    .map((p) => {
      const qty = Number(p.quantity) || 1;
      const paid = Number(p.paidPrice) || 0;
      const unit = Number(p.unitPrice) || 0;
      const showUnit = qty > 1 && unit > 0;
      let html = `
        <div class="product">
          <div class="product-line">
            <span class="prod-qty">${qty}x</span>
            <span class="prod-name">${escHtml(p.name)}</span>
            <span class="prod-price">${fmtTL(paid)}</span>
          </div>
          ${showUnit
            ? `<div class="product-sub">birim ${fmtTL(unit)}</div>`
            : ""}
          ${buildToppingLines(p.selectedToppings)}
          ${p.comment ? `<div class="prod-note">Not: ${escHtml(p.comment)}</div>` : ""}
        </div>
      `;
      return html;
    })
    .join("");

  const subTotal = order.totals.subTotal ?? null;
  const vat = order.totals.vatTotal ?? null;
  const fee = order.totals.deliveryFee ?? 0;
  const discount = order.totals.discountTotal ?? 0;
  const grand = order.totals.grandTotal;
  const tip = order.totals.riderTip ?? 0;

  const isGetir = /getir/i.test(platformLabel);
  const verifyCode = (order.verificationCode || "").trim();
  const logoHtml = isGetir
    ? `<div style="text-align:center;background:linear-gradient(180deg,#FFD300 0%,#F5C500 100%);border:2px solid #000;border-radius:10px;padding:8px 6px;margin-bottom:4px">
        <div style="font-size:32px;font-weight:900;font-style:italic;color:#5D3EBC;letter-spacing:-1px;line-height:1">getir</div>
        <div style="font-size:11px;font-weight:900;color:#5D3EBC;letter-spacing:3px;margin-top:2px">YEMEK</div>
      </div>`
    : `<div class="platform-h">${escHtml(platformLabel)}</div>`;

  return `
<style>
  .dh-r { font-family: Arial, sans-serif; width: 72mm; padding: 2mm 1mm; color: #000; }
  .dh-r * { box-sizing: border-box; }
  .dh-r .platform-h { text-align:center; font-weight:900; font-size:20px; letter-spacing:2px; padding:6px 0; border:2px solid #000; margin-bottom:4px; }
  .dh-r .verify-box { text-align:center; font-size:22px; font-weight:900; letter-spacing:4px; padding:6px 0; border:2px dashed #5D3EBC; margin:4px 0; color:#5D3EBC; }
  .dh-r .code-box { text-align:center; font-size:26px; font-weight:900; letter-spacing:3px; padding:5px 0; border:2px solid #000; margin:4px 0; }
  .dh-r .flag-row { display:flex; gap:4px; justify-content:center; flex-wrap:wrap; margin:4px 0; }
  .dh-r .flag { font-size:10px; font-weight:900; padding:2px 6px; border:1px solid #000; }
  .dh-r .flag.warn { background:#000; color:#fff; }
  .dh-r .row { display:flex; justify-content:space-between; gap:6px; font-size:12px; margin:1px 0; }
  .dh-r .row.small { font-size:11px; }
  .dh-r .label { font-weight:800; }
  .dh-r .section { border:1px solid #000; padding:4px 6px; margin:4px 0; font-size:12px; }
  .dh-r .section .section-title { font-weight:900; text-transform:uppercase; font-size:10px; margin-bottom:3px; letter-spacing:1px; }
  .dh-r .addr-line { font-size:12px; margin:1px 0; }
  .dh-r .note-box { background:#fff3a8; border:2px solid #000; padding:5px 6px; margin:4px 0; font-weight:800; font-size:12px; }
  .dh-r .vendor-note { border:1px dashed #555; padding:4px 6px; margin:3px 0; font-size:11px; font-style:italic; }
  .dh-r .products { border-top:2px solid #000; border-bottom:2px solid #000; padding:5px 0; margin:6px 0; }
  .dh-r .product { padding:2px 0; }
  .dh-r .product + .product { border-top:1px dashed #aaa; margin-top:4px; padding-top:4px; }
  .dh-r .product-line { display:flex; align-items:flex-start; gap:4px; font-size:13px; font-weight:700; line-height:1.3; }
  .dh-r .product-line .prod-qty { min-width:26px; font-weight:900; }
  .dh-r .product-line .prod-name { flex:1; }
  .dh-r .product-line .prod-price { font-weight:900; }
  .dh-r .product-sub { font-size:10px; color:#444; padding-left:30px; }
  .dh-r .topping { font-size:11px; color:#222; line-height:1.35; }
  .dh-r .prod-note { font-size:11px; font-style:italic; color:#333; padding-left:30px; margin-top:1px; }
  .dh-r .totals { margin-top:4px; }
  .dh-r .totals .row { font-size:12px; }
  .dh-r .totals .grand { font-size:16px; font-weight:900; border-top:1px solid #000; padding-top:3px; margin-top:3px; }
  .dh-r .footer { text-align:center; font-size:10px; margin-top:6px; color:#444; }
  .dh-r .token { text-align:center; font-size:9px; color:#888; margin-top:2px; word-break:break-all; }
</style>
<div class="dh-r">
  ${logoHtml}
  ${verifyCode ? `<div class="verify-box">DOĞRULAMA: ${escHtml(verifyCode.toUpperCase())}</div>` : ""}
  ${orderCode ? `<div class="code-box">${escHtml(orderCode)}</div>` : ""}

  <div class="flag-row">
    ${order.testOrder ? `<span class="flag warn">TEST</span>` : ""}
    ${order.preOrder ? `<span class="flag">İLERİ TARİHLİ</span>` : ""}
    ${order.ortakKampanya ? `<span class="flag warn">ORTAK KAMPANYA</span>` : ""}
    ${order.courierBadge ? `<span class="flag">${escHtml(order.courierBadge)}</span>` : ""}
    ${order.delivery?.expressDelivery ? `<span class="flag warn">EXPRESS</span>` : ""}
    <span class="flag">${isDelivery ? "TESLİMAT" : "GEL-AL"}</span>
    <span class="flag">${order.isPaid ? "ONLİNE ÖDEME" : "KAPIDA ÖDEME"}</span>
  </div>

  <div class="row"><span class="label">Tarih:</span><span>${fmtDate(order.createdAt)}</span></div>
  <div class="row"><span class="label">Ödeme:</span><span>${order.isPaid ? "Online Ödendi" : `Kapıda${order.paymentType ? ` (${escHtml(order.paymentType)})` : ""}`}</span></div>
  ${order.delivery?.expectedDeliveryTime
      ? `<div class="row"><span class="label">Teslim:</span><span>${fmtDate(order.delivery.expectedDeliveryTime)}</span></div>`
      : ""}
  ${order.delivery?.riderPickupTime
      ? `<div class="row"><span class="label">Kurye:</span><span>${fmtDate(order.delivery.riderPickupTime)}</span></div>`
      : ""}

  <div class="section">
    <div class="section-title">Müşteri</div>
    <div>${escHtml(customerFull)}</div>
    ${phone ? `<div><span class="label">Tel:</span> ${escHtml(phone)}</div>` : ""}
    ${email ? `<div style="font-size:11px"><span class="label">E-posta:</span> ${escHtml(email)}</div>` : ""}
  </div>

  ${isDelivery && addressLines.length > 0
      ? `<div class="section">
          <div class="section-title">Teslimat Adresi</div>
          ${addressLines.map((l) => `<div class="addr-line">${escHtml(l)}</div>`).join("")}
        </div>`
      : ""}

  ${!isDelivery && (pickupCode || pickupTime)
      ? `<div class="section">
          <div class="section-title">Gel-Al</div>
          ${pickupCode ? `<div><span class="label">Kod:</span> ${escHtml(pickupCode)}</div>` : ""}
          ${pickupTime ? `<div><span class="label">Saat:</span> ${fmtDate(pickupTime)}</div>` : ""}
        </div>`
      : ""}

  ${order.customerComment
      ? `<div class="note-box">SİPARİŞ NOTU:<br/>${escHtml(order.customerComment)}</div>`
      : ""}

  ${order.vendorComment
      ? `<div class="vendor-note">Restoran notu: ${escHtml(order.vendorComment)}</div>`
      : ""}

  <div class="products">${productsHtml || "<div>(ürün yok)</div>"}</div>

  <div class="totals">
    ${subTotal != null ? `<div class="row"><span>Ara Toplam</span><span>${fmtTL(subTotal)}</span></div>` : ""}
    ${discount > 0
      ? `<div class="row"><span>${order.ortakKampanya ? "Ortak Kampanya (-)" : "İndirim (-)"}</span><span>-${fmtTL(discount)}</span></div>`
      : ""}
    ${fee > 0 ? `<div class="row"><span>Teslimat Ücreti</span><span>${fmtTL(fee)}</span></div>` : ""}
    ${tip > 0 ? `<div class="row"><span>Kurye Bahşişi</span><span>${fmtTL(tip)}</span></div>` : ""}
    ${vat != null && vat > 0 ? `<div class="row small"><span>KDV Dahil</span><span>${fmtTL(vat)}</span></div>` : ""}
    <div class="row grand"><span>TOPLAM</span><span>${fmtTL(grand)}</span></div>
  </div>

  <div class="footer">${escHtml(platformLabel)} • ŞefPOS</div>
  ${orderToken ? `<div class="token">${escHtml(orderToken)}</div>` : ""}
</div>
`;
}
