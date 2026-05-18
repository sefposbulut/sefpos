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
  /** Getir teslimat tercihleri (kapıya bırak, zili çalma, çatal yok, teslimat zamanı). */
  deliveryPreferences?: string[];

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

function extractLocalized(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object" && val !== null) {
    const o = val as Record<string, unknown>;
    for (const k of ["tr", "TR", "en", "EN"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    for (const v of Object.values(o)) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return String(val).trim();
}

/** Getir müşteri hattı — kısa format (yedek). */
export function formatGetirMaskedPhone(phone: string | null | undefined): string {
  return formatGetirMaskedPhonePanel(phone);
}

/**
 * Getir restoran paneli formatı: `90 (850) 346-9382 / 000001`
 * phoneCode = santral uzantısı (6 hane).
 */
export function formatGetirMaskedPhonePanel(
  phone: string | null | undefined,
  phoneCode?: string | null | undefined,
): string {
  const raw = String(phone || "").trim();
  const extRaw = String(phoneCode || "").replace(/\D/g, "");
  if (!raw && !extRaw) return "";

  if (raw.includes("(850)") || raw.includes("(850)")) {
    const ext = extRaw ? extRaw.padStart(6, "0").slice(-6) : "";
    return ext && !raw.includes("/") ? `${raw} / ${ext}` : raw;
  }

  if (raw.includes("/")) {
    const idx = raw.indexOf("/");
    const left = raw.slice(0, idx).trim();
    const right = raw.slice(idx + 1).trim().replace(/\D/g, "").padStart(6, "0").slice(-6);
    const formattedLeft = formatGetirMaskedPhonePanel(left);
    return right ? `${formattedLeft} / ${right}` : formattedLeft;
  }

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("90")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  let ext = extRaw ? extRaw.padStart(6, "0").slice(-6) : "";
  if (digits.startsWith("850")) {
    const rest = digits.slice(3);
    if (!ext && rest.length > 10) {
      ext = rest.slice(10).padStart(6, "0").slice(-6);
    }
    const r = rest.slice(0, 10);
    const a = r.slice(0, 3);
    const b = r.slice(3, 6);
    const c = r.slice(6, 10);
    let mid = a;
    if (b) mid += `-${b}`;
    if (c) mid += `-${c}`;
    const line = `90 (850) ${mid}`.trim();
    return ext ? `${line} / ${ext}` : line;
  }

  return raw;
}

export interface GetirParsedOrderNotes {
  textNote: string | null;
  preferences: string[];
  combined: string | null;
}

function isTruthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes" || s === "evet";
  }
  return false;
}

function isExplicitFalse(v: unknown): boolean {
  if (v === false || v === 0) return true;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "false" || s === "0" || s === "no" || s === "hayır" || s === "hayir";
  }
  return false;
}

/** Getir order JSON — kök + client/customer/delivery iç içe nesneleri. */
function getirNestedSources(raw: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const walk = (obj: Record<string, unknown>, depth: number) => {
    if (!obj || seen.has(obj) || depth > 3) return;
    seen.add(obj);
    out.push(obj);
    for (const key of [
      "client",
      "customer",
      "delivery",
      "checkout",
      "orderDetails",
      "details",
      "preferences",
      "options",
      "extra",
      "extras",
    ]) {
      const child = obj[key];
      if (child && typeof child === "object" && !Array.isArray(child)) {
        walk(child as Record<string, unknown>, depth + 1);
      }
    }
  };
  walk(raw, 0);
  return out;
}

function firstTruthyFlag(sources: Record<string, unknown>[], keys: string[]): boolean {
  for (const src of sources) {
    for (const k of keys) {
      if (isTruthyFlag(src[k])) return true;
    }
  }
  return false;
}

function wantsNoRing(sources: Record<string, unknown>[]): boolean {
  if (
    firstTruthyFlag(sources, [
      "doNotKnock",
      "doNotRing",
      "dontRingBell",
      "doNotRingBell",
      "noRing",
      "dontRing",
      "ringBellOff",
      "disableRing",
      "silentDelivery",
    ])
  ) {
    return true;
  }
  for (const src of sources) {
    if (
      isExplicitFalse(src.ringDoorBell) ||
      isExplicitFalse(src.ringBell) ||
      isExplicitFalse(src.shouldRingBell)
    ) {
      return true;
    }
  }
  return false;
}

const GETIR_PREF_KEY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /drop.*door|door.*drop|leave.*door|atdoor|kapıya|kapiya|contactless/i, label: "Siparişi Kapıya Bırak" },
  { re: /donotknock|dont.*ring|noring|zili|ringbell|ring.*bell/i, label: "Zili Çalma" },
  { re: /eco|cutlery|çatal|servis|plastic|peçete|pecete|friendly/i, label: "Servis (çatal-bıçak-peçete) gönderme" },
];

function collectPrefsFromObjectFlags(sources: Record<string, unknown>[], addPref: (s: string) => void) {
  for (const src of sources) {
    for (const [key, val] of Object.entries(src)) {
      if (!isTruthyFlag(val)) continue;
      const kl = key.toLowerCase();
      for (const { re, label } of GETIR_PREF_KEY_PATTERNS) {
        if (re.test(kl)) addPref(label);
      }
    }
  }
}

function parseClientRequestText(req: unknown): string[] {
  const lines: string[] = [];
  if (typeof req === "string" && req.trim()) {
    lines.push(req.trim());
    return lines;
  }
  if (Array.isArray(req)) {
    for (const item of req) {
      if (typeof item === "string" && item.trim()) lines.push(item.trim());
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const t = extractLocalized(o.title || o.name || o.label || o.text || o.description);
        if (t) lines.push(t);
      }
    }
    return lines;
  }
  if (req && typeof req === "object") {
    const o = req as Record<string, unknown>;
    for (const [key, val] of Object.entries(o)) {
      if (typeof val === "string" && val.trim()) lines.push(val.trim());
      else if (isTruthyFlag(val)) {
        const kl = key.toLowerCase();
        for (const { re, label } of GETIR_PREF_KEY_PATTERNS) {
          if (re.test(kl)) lines.push(label);
        }
      }
    }
  }
  return lines;
}

/** Getir ham JSON → metin not + teslimat tercihleri (fiş ve DB için). */
export function parseGetirOrderNotes(
  raw: Record<string, unknown>,
  dbNotes?: string | null,
): GetirParsedOrderNotes {
  const sources = getirNestedSources(raw);
  const textParts: string[] = [];
  const pushText = (v: unknown) => {
    const t = typeof v === "string" ? v.trim() : extractLocalized(v);
    if (!t) return;
    if (textParts.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    textParts.push(t);
  };

  pushText(dbNotes);
  for (const src of sources) {
    pushText(src.note);
    pushText(src.clientNote);
    pushText(src.orderNote);
    pushText(src.customerNote);
    pushText(src.restaurantNote);
    pushText(src.vendorNote);
    const comments = src.comments as Record<string, unknown> | undefined;
    if (comments) {
      pushText(comments.customerComment);
      pushText(comments.vendorComment);
    }
    for (const line of parseClientRequestText(src.clientRequest)) {
      const isPref = GETIR_PREF_KEY_PATTERNS.some(({ label }) =>
        line.toLowerCase() === label.toLowerCase()
      );
      if (!isPref) pushText(line);
    }
  }

  const preferences: string[] = [];
  const addPref = (s: string) => {
    const t = s.trim();
    if (t && !preferences.includes(t)) preferences.push(t);
  };

  const scheduled =
    firstTruthyFlag(sources, ["isScheduled", "scheduled"]) ||
    sources.some((s) => s.scheduledDate != null && String(s.scheduledDate).trim() !== "");
  if (scheduled) {
    const sd = raw.scheduledDate ?? sources.find((s) => s.scheduledDate)?.scheduledDate;
    addPref(sd ? "İleri tarihli teslimat" : "İleri tarihli sipariş");
  } else {
    addPref("Teslimat: Şimdi gelsin");
  }

  if (
    firstTruthyFlag(sources, [
      "dropOffAtDoor",
      "dropOrderAtDoor",
      "leaveAtDoor",
      "leaveOrderAtDoor",
      "contactlessDelivery",
      "isContactlessDelivery",
      "doorDropOff",
      "isDropOffAtDoor",
    ])
  ) {
    addPref("Siparişi Kapıya Bırak");
  }
  if (wantsNoRing(sources)) addPref("Zili Çalma");
  if (
    firstTruthyFlag(sources, [
      "isEcoFriendly",
      "ecoFriendly",
      "noCutlery",
      "withoutCutlery",
      "dontSendCutlery",
      "skipPlasticCutlery",
      "noPlasticCutlery",
      "isReusable",
      "noServiceItems",
    ])
  ) {
    addPref("Servis (çatal-bıçak-peçete) gönderme");
  }

  collectPrefsFromObjectFlags(sources, addPref);

  const textNote = textParts.length ? textParts.join(" • ") : null;
  const combined = [...preferences, ...(textNote ? [textNote] : [])].join(" • ") || null;
  return { textNote, preferences, combined };
}

/** DB `customer_notes` — tüm not + tercihler tek satır. */
export function buildGetirCustomerNotesForDb(order: Record<string, unknown>): string | null {
  return parseGetirOrderNotes(order, null).combined;
}

/** @deprecated `parseGetirOrderNotes` kullanın */
export function extractGetirOrderNotes(
  raw: Record<string, unknown>,
  dbNotes?: string | null,
): string | null {
  return parseGetirOrderNotes(raw, dbNotes).combined;
}

function mapGetirItemToppings(toppings: unknown): DHToppingForReceipt[] | undefined {
  if (!Array.isArray(toppings) || toppings.length === 0) return undefined;
  const out: DHToppingForReceipt[] = [];
  for (const t of toppings) {
    if (typeof t === "string" && t.trim()) {
      out.push({ name: t.trim(), quantity: 1 });
      continue;
    }
    if (t && typeof t === "object") {
      const o = t as Record<string, unknown>;
      const name = extractLocalized(o.name || o.optionName || o.title || o.label);
      if (name) out.push({ name, quantity: Number(o.quantity || o.count || 1) || 1 });
    }
  }
  return out.length ? out : undefined;
}

/** Webhook/poll ham JSON'dan ürün satırları (DB kalemleri yoksa). */
export function mapGetirProductsFromRaw(raw: Record<string, unknown> | null | undefined): DHProductForReceipt[] {
  const products = Array.isArray(raw?.products) ? raw!.products : [];
  return products.map((p: Record<string, unknown>) => {
    const qty = Number(p.count ?? p.quantity ?? 1) || 1;
    const unit = Number(p.price ?? p.unitPrice ?? 0);
    const paid = Number(p.totalPrice ?? p.paidPrice ?? unit * qty);
    return {
      name: extractLocalized(p.name || p.productName || (p.menuItem as Record<string, unknown>)?.name) || "Ürün",
      quantity: qty,
      unitPrice: unit,
      paidPrice: paid,
      comment: extractLocalized(p.note || p.specialInstructions) || null,
      selectedToppings: mapGetirItemToppings(p.options || p.selectedOptions || p.extras),
    };
  });
}

export interface GetirReceiptDbSlice {
  platform_order_number?: string | null;
  platform_order_id?: string | null;
  id?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_notes?: string | null;
  platform_created_at?: string | null;
  created_at?: string;
  estimated_delivery_time?: string | null;
  rider_pickup_time?: string | null;
  payment_type?: string | null;
  subtotal?: number | null;
  delivery_fee?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  total_amount?: number;
  getir_verification_code?: string | null;
  getir_masked_phone?: string | null;
  getir_delivery_type?: number | null;
  getir_is_scheduled?: boolean | null;
  getir_total_discount?: number | null;
  getir_supplier_support_rate?: number | null;
  getir_raw_payload?: Record<string, unknown> | null;
}

export interface GetirReceiptItemSlice {
  platform_product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
  toppings?: unknown;
}

/** DB + ham Getir payload → tek fiş girdisi (onay / tekrar bas). */
export function buildGetirReceiptInput(
  order: GetirReceiptDbSlice,
  items: GetirReceiptItemSlice[],
): DHReceiptOrderInput {
  const raw = (order.getir_raw_payload && typeof order.getir_raw_payload === "object")
    ? order.getir_raw_payload
    : {};
  const customer = (raw.client || raw.customer || {}) as Record<string, unknown>;

  const verificationCode = String(
    order.getir_verification_code ||
      raw.confirmationId ||
      raw.verificationCode ||
      "",
  ).trim() || null;

  const phoneCode = String(
    customer.phoneCode || raw.phoneCode || customer.extension || raw.extension || "",
  ).trim() || null;

  const maskedPhone = formatGetirMaskedPhonePanel(
    order.getir_masked_phone ||
      order.customer_phone ||
      String(customer.maskedPhoneNumber || customer.phoneNumber || customer.phone || ""),
    phoneCode,
  ) || null;

  const parsedNotes = parseGetirOrderNotes(raw, order.customer_notes);

  const subtotal = Number(order.subtotal ?? raw.totalPrice ?? 0);
  const discounted = Number(
    order.total_amount ?? raw.totalDiscountedPrice ?? raw.totalPrice ?? subtotal,
  );
  const discount =
    Number(order.discount_amount) ||
    Number(order.getir_total_discount) ||
    (subtotal && discounted ? Math.max(0, subtotal - discounted) : 0);
  const supplierRate = Number(order.getir_supplier_support_rate ?? raw.supplierSupportRate ?? 0);
  const ortakKampanya =
    discount > 0 ||
    supplierRate > 0 ||
    !!(raw.isSupplierSupportApplied || raw.supplierSupportApplied);

  const dt = Number(order.getir_delivery_type ?? raw.deliveryType ?? 0);
  const courierBadge =
    dt === 1 ? "GETİR GETİRSİN" : dt === 2 ? "RESTORAN GETİRSİN" : null;

  const dbProducts: DHProductForReceipt[] = (items || []).map((it) => ({
    name: it.platform_product_name || "Ürün",
    quantity: it.quantity,
    unitPrice: it.unit_price,
    paidPrice: it.total_amount,
    comment: it.notes,
    selectedToppings: mapGetirItemToppings(it.toppings),
  }));
  const products = dbProducts.length > 0 ? dbProducts : mapGetirProductsFromRaw(raw);

  const addressObj = (raw.address || customer.address || {}) as Record<string, unknown>;
  const addressFromRaw = [
    addressObj.address,
    addressObj.aptNo ? `Daire: ${addressObj.aptNo}` : null,
    addressObj.floor ? `Kat: ${addressObj.floor}` : null,
    addressObj.directions ? `(${addressObj.directions})` : null,
  ].filter(Boolean).join(", ");

  return {
    platformLabel: "GETİR YEMEK",
    orderCode:
      order.platform_order_number ||
      String(raw.orderNumber || raw.confirmationId || "") ||
      order.platform_order_id ||
      (order.id || "").slice(0, 8),
    orderToken: null,
    createdAt: order.platform_created_at || order.created_at || null,
    expeditionType: "delivery",
    isPaid: true,
    paymentType: order.payment_type || "Getir",
    preOrder: !!(order.getir_is_scheduled || raw.isScheduled),
    customer: {
      fullName: order.customer_name || extractLocalized(customer.name || customer.firstName) || "Müşteri",
      mobilePhone: maskedPhone,
    },
    delivery: (order.customer_address || addressFromRaw)
      ? {
          address: { street: order.customer_address || addressFromRaw },
          expectedDeliveryTime: order.estimated_delivery_time || null,
          expressDelivery: false,
          riderPickupTime: order.rider_pickup_time || null,
        }
      : null,
    pickup: null,
    customerComment: parsedNotes.textNote,
    deliveryPreferences: parsedNotes.preferences,
    vendorComment: extractLocalized(raw.vendorNote || raw.restaurantNote) || null,
    verificationCode,
    ortakKampanya,
    courierBadge,
    products,
    totals: {
      grandTotal: Number(order.total_amount) || discounted || subtotal,
      subTotal: subtotal || undefined,
      vatTotal: Number(order.tax_amount) || undefined,
      deliveryFee: Number(order.delivery_fee) || undefined,
      discountTotal: discount > 0 ? discount : undefined,
    },
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

/**
 * Getir Yemek resmi fiş düzeni — termal yazıcı uyumlu (siyah/beyaz, flex/gradient yok).
 * Getir sertifikasyon: logo, doğrulama kodu, 0850 hat, sipariş notu, ortak kampanya, ürünler.
 */
export function renderGetirThermalReceiptHtml(order: DHReceiptOrderInput): string {
  const customerFull =
    (order.customer?.fullName ||
      [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") ||
      "Müşteri").trim();
  const phoneLine = formatGetirMaskedPhonePanel(order.customer?.mobilePhone || "");
  const verifyCode = (order.verificationCode || "").trim().toUpperCase();
  const orderCode = (order.orderCode || "").trim();
  const addressLines = buildAddressLines(order.delivery);
  const subTotal = order.totals.subTotal ?? null;
  const discount = order.totals.discountTotal ?? 0;
  const fee = order.totals.deliveryFee ?? 0;
  const grand = order.totals.grandTotal;

  const productsHtml = (order.products || [])
    .map((p) => {
      const qty = Number(p.quantity) || 1;
      const paid = Number(p.paidPrice) || 0;
      let block =
        `<tr><td style="font-weight:900;width:28px;vertical-align:top">${qty}x</td>` +
        `<td style="vertical-align:top;font-weight:700">${escHtml(p.name)}</td>` +
        `<td style="text-align:right;font-weight:900;vertical-align:top;white-space:nowrap">${fmtTL(paid)}</td></tr>`;
      if (p.comment) {
        block +=
          `<tr><td></td><td colspan="2" style="font-size:11px;font-style:italic;padding:0 0 4px 0">↳ Not: ${escHtml(p.comment)}</td></tr>`;
      }
      const tops = buildToppingLines(p.selectedToppings);
      if (tops) {
        block += `<tr><td></td><td colspan="2" style="font-size:11px;padding:0 0 4px 4px">${tops}</td></tr>`;
      }
      return block;
    })
    .join("");

  const W = "width:72mm;max-width:72mm;font-family:Arial,Helvetica,sans-serif;color:#000;font-size:12px;line-height:1.35;";
  const box = "border:2px solid #000;padding:6px 4px;margin:4px 0;text-align:center;";
  const big = "font-size:22px;font-weight:900;letter-spacing:2px;";

  const prefs = order.deliveryPreferences ?? [];
  const prefsHtml =
    prefs.length > 0
      ? `<div style="${box}text-align:left;padding:4px 5px;"><div style="font-size:10px;font-weight:900;margin-bottom:2px;">TESLİMAT TERCİHLERİ</div>${prefs.map((p) => `<div style="font-size:10px;font-weight:700;line-height:1.3;">▪ ${escHtml(p)}</div>`).join("")}</div>`
      : "";
  const noteHtml = order.customerComment
    ? `<div style="${box}text-align:left;padding:4px 5px;"><div style="font-size:10px;font-weight:900;margin-bottom:2px;">SİPARİŞ NOTU</div><div style="font-size:11px;font-weight:700;word-wrap:break-word;">${escHtml(order.customerComment)}</div></div>`
    : "";

  return `<div style="${W}">
  <div style="${box}">
    <div style="font-size:30px;font-weight:900;line-height:1;letter-spacing:-1px;">GETİR</div>
    <div style="font-size:13px;font-weight:900;letter-spacing:5px;margin-top:3px;">YEMEK</div>
  </div>
  ${verifyCode
    ? `<div style="${box}"><div style="font-size:11px;font-weight:900;">SİPARİŞ DOĞRULAMA KODU</div><div style="${big}margin-top:4px;">${escHtml(verifyCode)}</div></div>`
    : ""}
  ${phoneLine
    ? `<div style="${box}"><div style="font-size:11px;font-weight:900;">MÜŞTERİ HATTI (MASKELİ)</div><div style="font-size:15px;font-weight:900;margin-top:4px;">${escHtml(phoneLine)}</div></div>`
    : ""}
  ${orderCode ? `<div style="${box}"><div style="font-size:11px;font-weight:900;">SİPARİŞ NO</div><div style="${big}margin-top:2px;">#${escHtml(orderCode)}</div></div>` : ""}
  ${order.ortakKampanya
    ? `<div style="${box}border:3px solid #000;"><div style="font-size:14px;font-weight:900;">ORTAK KAMPANYA</div></div>`
    : ""}
  ${prefsHtml}
  ${noteHtml}
  ${order.courierBadge ? `<div style="text-align:center;font-size:11px;font-weight:900;margin:4px 0;border:1px solid #000;padding:3px;">${escHtml(order.courierBadge)}</div>` : ""}
  <div style="border:1px solid #000;padding:4px 6px;margin:4px 0;">
    <div style="font-size:10px;font-weight:900;margin-bottom:2px;">MÜŞTERİ</div>
    <div style="font-weight:700;">${escHtml(customerFull)}</div>
  </div>
  ${addressLines.length > 0
    ? `<div style="border:1px solid #000;padding:4px 6px;margin:4px 0;">
        <div style="font-size:10px;font-weight:900;margin-bottom:2px;">TESLİMAT ADRESİ</div>
        ${addressLines.map((l) => `<div>${escHtml(l)}</div>`).join("")}
      </div>`
    : ""}
  <div style="font-size:10px;font-weight:900;margin:6px 0 2px;">SİPARİŞ DETAYI</div>
  <table style="width:100%;border-collapse:collapse;border-top:2px solid #000;border-bottom:2px solid #000;">
    ${productsHtml || `<tr><td colspan="3">(ürün yok)</td></tr>`}
  </table>
  <div style="margin-top:6px;">
    ${subTotal != null ? `<div style="margin:2px 0;"><table style="width:100%"><tr><td>Ara Toplam</td><td style="text-align:right">${fmtTL(subTotal)}</td></tr></table></div>` : ""}
    ${discount > 0
      ? `<div style="margin:2px 0;"><table style="width:100%"><tr><td>${order.ortakKampanya ? "Ortak Kampanya (-)" : "İndirim (-)"}</td><td style="text-align:right">-${fmtTL(discount)}</td></tr></table></div>`
      : ""}
    ${fee > 0 ? `<div style="margin:2px 0;"><table style="width:100%"><tr><td>Teslimat</td><td style="text-align:right">${fmtTL(fee)}</td></tr></table></div>` : ""}
    <div style="margin:4px 0;font-size:16px;font-weight:900;border-top:2px solid #000;padding-top:4px;">
      <table style="width:100%"><tr><td>TOPLAM</td><td style="text-align:right">${fmtTL(grand)}</td></tr></table>
    </div>
  </div>
  <div style="text-align:center;font-size:10px;margin-top:8px;">${fmtDate(order.createdAt)} • Online Ödendi</div>
  <div style="text-align:center;font-size:10px;margin-top:4px;">GETİR YEMEK • ŞefPOS</div>
</div>`;
}

export function renderDHOrderReceiptHtml(order: DHReceiptOrderInput): string {
  if (/getir/i.test(order.platformLabel || "")) {
    return renderGetirThermalReceiptHtml(order);
  }

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
  const maskedPhoneLine = isGetir ? formatGetirMaskedPhone(phone) : phone;
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
  .dh-r .phone-box { text-align:center; font-size:14px; font-weight:900; padding:5px 6px; border:2px solid #000; margin:4px 0; background:#f5f5f5; line-height:1.35; }
  .dh-r .phone-box .phone-num { font-size:16px; letter-spacing:1px; margin-top:2px; }
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
  ${verifyCode ? `<div class="verify-box">SİPARİŞ DOĞRULAMA<br/>${escHtml(verifyCode.toUpperCase())}</div>` : ""}
  ${isGetir && maskedPhoneLine
      ? `<div class="phone-box">MÜŞTERİ HATTI (MASKELİ)<div class="phone-num">${escHtml(maskedPhoneLine)}</div></div>`
      : ""}
  ${orderCode ? `<div class="code-box">#${escHtml(orderCode)}</div>` : ""}

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
    ${phone && !(isGetir && maskedPhoneLine) ? `<div><span class="label">Tel:</span> ${escHtml(phone)}</div>` : ""}
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
