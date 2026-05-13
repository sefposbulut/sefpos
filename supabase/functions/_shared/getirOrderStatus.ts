/**
 * Getir Yemek — sipariş durumu eşlemesi (tek kaynak, Edge Function'lar için).
 *
 * Sayısal kodlar: Getir Food API resmi dokümantasyonu
 *   https://developers.getir.com/food/documentation
 *   (325, 350, 400, 410, 500, 550, 600, 700, 800, 900, 1500, 1600)
 *
 * Metin enumlar: GetirYemek webhook / platform sözleşmesindeki durum adları.
 * API'de yeni bir değer çıkarsa `GETIR_PLATFORM_ENUM_MAP` ve gerekirse
 * `mapUnknownPlatformEnum` güncellenmelidir; varsayılan "tahmin" yapılmaz.
 */

/** Dokümanda geçen bilinen platform string enumları (büyük harf anahtar). */
export const GETIR_PLATFORM_ENUM_MAP: Record<
  string,
  { internalStatus: string; numericCode: number | null; labelTr: string }
> = {
  NEW_ORDER: { internalStatus: "new", numericCode: 325, labelTr: "Yeni Sipariş" },
  CONFIRMED: { internalStatus: "verified", numericCode: 400, labelTr: "Restoran Onayladı" },
  PREPARING: { internalStatus: "preparing", numericCode: 410, labelTr: "Hazırlanıyor" },
  READY_FOR_PICKUP: { internalStatus: "ready", numericCode: 500, labelTr: "Hazır" },
  COURIER_PICKED_UP: { internalStatus: "handed_over", numericCode: 550, labelTr: "Kuryeye Teslim Edildi" },
  DELIVERED: { internalStatus: "delivered", numericCode: 900, labelTr: "Teslim Edildi" },
  CANCELLED: { internalStatus: "cancelled", numericCode: 1500, labelTr: "İptal Edildi" },
  /** Webhook enum; Food API’de 1600 iptal kodu ile karışmaması için sayısal kod tutulmaz. */
  REJECTED: { internalStatus: "rejected", numericCode: null, labelTr: "Reddedildi" },
};

/** Getir Food API — bilinen tamsayı kod → ŞefPOS `online_orders.status`. */
export const GETIR_NUMERIC_STATUS_MAP: Record<number, { internalStatus: string; labelTr: string }> = {
  325: { internalStatus: "new", labelTr: "Yeni Sipariş" },
  350: { internalStatus: "scheduled_new", labelTr: "İleri Tarihli Yeni" },
  400: { internalStatus: "verified", labelTr: "Restoran Onayladı" },
  410: { internalStatus: "preparing", labelTr: "Hazırlanıyor" },
  500: { internalStatus: "ready", labelTr: "Hazır" },
  550: { internalStatus: "handed_over", labelTr: "Kuryeye Teslim Edildi" },
  600: { internalStatus: "on_the_way", labelTr: "Yolda" },
  700: { internalStatus: "on_the_way", labelTr: "Yolda" },
  800: { internalStatus: "arrived", labelTr: "Teslim Noktasında" },
  900: { internalStatus: "delivered", labelTr: "Teslim Edildi" },
  1500: { internalStatus: "cancelled", labelTr: "İptal Edildi" },
  1600: { internalStatus: "cancelled", labelTr: "İptal Edildi" },
};

export const INTERNAL_UNKNOWN_STATUS = "getir_unmapped";

export function normalizePlatformEnumKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function mapUnknownNumeric(code: number): { internalStatus: string; labelTr: string } {
  return {
    internalStatus: INTERNAL_UNKNOWN_STATUS,
    labelTr: `Bilinmeyen Getir kodu (${code})`,
  };
}

/** `online_orders.status` (ŞefPOS iç kodu) → kısa Türkçe etiket (UI rozet / liste). */
export function internalStatusLabelTr(status: string): string {
  if (status === INTERNAL_UNKNOWN_STATUS) return "Getir (eşlenmemiş durum)";
  const fromNum = Object.values(GETIR_NUMERIC_STATUS_MAP).find((v) => v.internalStatus === status);
  if (fromNum) return fromNum.labelTr;
  const fromEnum = Object.values(GETIR_PLATFORM_ENUM_MAP).find((v) => v.internalStatus === status);
  if (fromEnum) return fromEnum.labelTr;
  return status;
}

export function mapUnknownPlatformEnum(enumKey: string): {
  internalStatus: string;
  numericCode: number | null;
  labelTr: string;
} {
  return {
    internalStatus: INTERNAL_UNKNOWN_STATUS,
    numericCode: null,
    labelTr: `Bilinmeyen platform durumu (${enumKey})`,
  };
}

/** Metin enum → dahili durum (NEW_ORDER + ileri tarih → scheduled_new / 350). */
export function resolveFromPlatformEnum(
  raw: string | null | undefined,
  isScheduled: boolean,
): { internalStatus: string; platformEnum: string; numericCode: number | null; labelTr: string } {
  const key = normalizePlatformEnumKey(raw);
  if (!key) {
    return {
      internalStatus: isScheduled ? "scheduled_new" : "new",
      platformEnum: "NEW_ORDER",
      numericCode: isScheduled ? 350 : 325,
      labelTr: isScheduled ? "İleri Tarihli Yeni" : "Yeni Sipariş",
    };
  }
  if (key === "NEW_ORDER" && isScheduled) {
    return {
      internalStatus: "scheduled_new",
      platformEnum: "NEW_ORDER",
      numericCode: 350,
      labelTr: "İleri Tarihli Yeni",
    };
  }
  const mapped = GETIR_PLATFORM_ENUM_MAP[key];
  if (mapped) {
    return { internalStatus: mapped.internalStatus, platformEnum: key, numericCode: mapped.numericCode, labelTr: mapped.labelTr };
  }
  const u = mapUnknownPlatformEnum(key);
  return { internalStatus: u.internalStatus, platformEnum: key, numericCode: u.numericCode, labelTr: u.labelTr };
}

export function resolveFromNumeric(
  code: number,
  isScheduled: boolean,
): { internalStatus: string; numericCode: number; labelTr: string } {
  if (!Number.isFinite(code)) {
    return resolveFromNumeric(isScheduled ? 350 : 325, isScheduled);
  }
  const m = GETIR_NUMERIC_STATUS_MAP[code];
  if (m) return { internalStatus: m.internalStatus, numericCode: code, labelTr: m.labelTr };
  const u = mapUnknownNumeric(code);
  return { internalStatus: u.internalStatus, numericCode: code, labelTr: u.labelTr };
}

export function internalStatusRank(s: string): number {
  const R: Record<string, number> = {
    [INTERNAL_UNKNOWN_STATUS]: 11,
    new: 20,
    scheduled_new: 20,
    verified: 30,
    accepted: 30,
    scheduled_accepted: 30,
    preparing: 40,
    ready: 50,
    handed_over: 60,
    on_the_way: 65,
    arrived: 70,
    delivered: 80,
    cancelled: 1000,
    rejected: 1000,
  };
  return R[s] ?? 0;
}

export function canTransitionGetir(
  from: string | null | undefined,
  to: string,
): { ok: boolean; reason?: string } {
  const f = (from || "").trim();
  if (f === to) return { ok: false, reason: "same" };
  if (f === "cancelled" || f === "rejected") {
    return { ok: false, reason: "terminal_frozen" };
  }
  if (f === "delivered" && to !== "cancelled") {
    return { ok: false, reason: "delivered_locked" };
  }
  if (to === "cancelled" || to === "rejected") return { ok: true };
  if (internalStatusRank(to) < internalStatusRank(f)) {
    return { ok: false, reason: "backward" };
  }
  return { ok: true };
}

export function extractGetirCourier(order: any): {
  name: string | null;
  phone: string | null;
  pickupAt: string | null;
} {
  const c = order?.courier ?? order?.driver ?? order?.rider ?? order?.deliveryCourier ?? order?.courierInfo;
  if (!c || typeof c !== "object") {
    return { name: null, phone: null, pickupAt: null };
  }
  const name =
    extractLocalizedOne(c.name || c.fullName || c.firstName) ||
    (typeof c.name === "string" ? c.name : null);
  const phone = String(c.phone || c.maskedPhoneNumber || c.phoneNumber || c.mobile || "").trim() || null;
  const pickupRaw = c.pickedUpAt || c.pickupAt || c.pickUpTime || order?.courierPickUpTime || order?.courierPickupTime;
  let pickupAt: string | null = null;
  if (pickupRaw) {
    const d = new Date(pickupRaw);
    if (!isNaN(d.getTime())) pickupAt = d.toISOString();
  }
  return { name, phone, pickupAt };
}

function extractLocalizedOne(val: any): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val.trim() || null;
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    const s = String(
      val.tr ?? val.TR ?? val.text ?? val.value ?? val.default ??
        Object.values(val).find((v) => typeof v === "string") ?? "",
    ).trim();
    return s || null;
  }
  return null;
}

/**
 * Webhook gövdesinden hedef durumu çıkar.
 * Öncelik: `eventType` / `event` string enum → yoksa sayısal `order.status`.
 */
export function resolveWebhookTargetStatus(
  body: Record<string, any>,
  order: any,
  urlType: string,
): { internalStatus: string; platformEnum: string | null; numericCode: number | null; labelTr: string } {
  const isScheduled = !!(order?.isScheduled ?? body?.isScheduled);
  const rawEnum =
    body?.eventType ?? body?.event ?? body?.type ?? body?.statusType ?? body?.orderStatus ?? null;
  const strEnum = typeof rawEnum === "string" && rawEnum.trim() ? rawEnum : null;

  if (strEnum) {
    const r = resolveFromPlatformEnum(strEnum, isScheduled);
    return {
      internalStatus: r.internalStatus,
      platformEnum: r.platformEnum,
      numericCode: r.numericCode,
      labelTr: r.labelTr,
    };
  }

  const st = order?.status;
  if (typeof st === "string" && st.trim() && isNaN(Number(st))) {
    const r = resolveFromPlatformEnum(st, isScheduled);
    return {
      internalStatus: r.internalStatus,
      platformEnum: r.platformEnum,
      numericCode: r.numericCode,
      labelTr: r.labelTr,
    };
  }
  if (st != null && !isNaN(Number(st))) {
    const r = resolveFromNumeric(Number(st), isScheduled);
    return {
      internalStatus: r.internalStatus,
      platformEnum: null,
      numericCode: r.numericCode,
      labelTr: r.labelTr,
    };
  }

  // URL ?type=new ve gövdede enum yok → klasik "yeni sipariş" (onay restoranda).
  if (urlType === "new") {
    const r = resolveFromPlatformEnum("NEW_ORDER", isScheduled);
    return {
      internalStatus: r.internalStatus,
      platformEnum: "NEW_ORDER",
      numericCode: r.numericCode,
      labelTr: r.labelTr,
    };
  }

  const r = resolveFromNumeric(isScheduled ? 350 : 325, isScheduled);
  return { internalStatus: r.internalStatus, platformEnum: null, numericCode: r.numericCode, labelTr: r.labelTr };
}

export async function sha256DedupeKeyPart(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 48);
}
