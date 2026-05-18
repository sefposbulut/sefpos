// deno-lint-ignore-file no-explicit-any

/** HemenYolda webhook payload — https://hemenyolda.com/api/integration/{app_name}/... */

export type HemenyoldaAction = "new" | "update" | "cancel";

export interface HemenyoldaOrderPayload {
  order: {
    id: string;
    customer: {
      fullName: string;
      phoneNumber: string;
      phoneCode: string | null;
    };
    address: {
      text: string;
      description: string | null;
      lat: number | null;
      lon: number | null;
    };
    products: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      options: Array<{ name: string }> | null;
    }>;
    source: string;
    note: string | null;
    totalAmount: number;
    totalDiscount: number | null;
    paymentMethod: string;
    platformCode: string | null;
    dailyOrderNo: string | null;
    createdAt: string;
    scheduledAt: string | null;
    courierPhone: string | null;
  };
}

export function isHemenyoldaPosOrder(row: {
  order_type?: string | null;
  order_subtype?: string | null;
  table_id?: string | null;
  status?: string | null;
}): boolean {
  if (row.table_id != null) return false;
  if (row.order_subtype === "gel_al") return false;
  const t = String(row.order_type || "");
  if (t === "delivery") return true;
  if (t === "takeaway") return true;
  return false;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function digitsOnly(phone: string | null | undefined): string {
  return String(phone || "").replace(/\D/g, "");
}

/** HemenYolda: başında 0 olmadan cep numarası */
export function normalizePhone(phone: string | null | undefined): string {
  let d = digitsOnly(phone);
  if (d.startsWith("90")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** HemenYolda: `YYYY-MM-DD HH:mm:ss` — mutlaka UTC (İstanbul saati değil). */
export function formatHemenYoldaUtcDateTime(date: Date = new Date()): string {
  const d = date;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function formatUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatHemenYoldaUtcDateTime(d);
}

/** Trendyol: çağrı merkezi hattı + 11 haneli müşteri kodu (6 hane kabul edilmez). */
export const TRENDYOL_HEMENYOLDA_CALL_CENTER = "8503469382";

export function splitTrendyolPhoneForHemenYolda(
  raw: string | null | undefined,
): { phoneNumber: string; phoneCode: string | null } {
  const d = digitsOnly(raw);
  if (!d) {
    return { phoneNumber: TRENDYOL_HEMENYOLDA_CALL_CENTER, phoneCode: null };
  }
  // Zaten çağrı merkezi formatı
  if (d.startsWith("850") && d.length <= 13) {
    return { phoneNumber: d.slice(0, 13), phoneCode: null };
  }
  let local = d;
  if (local.startsWith("90")) local = local.slice(2);
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length >= 11) {
    return {
      phoneNumber: TRENDYOL_HEMENYOLDA_CALL_CENTER,
      phoneCode: local.slice(0, 11),
    };
  }
  if (local.length >= 6) {
    return {
      phoneNumber: TRENDYOL_HEMENYOLDA_CALL_CENTER,
      phoneCode: local.padStart(11, "0").slice(-11),
    };
  }
  return { phoneNumber: TRENDYOL_HEMENYOLDA_CALL_CENTER, phoneCode: local || null };
}

function mapPaymentMethod(method: string | null, collected: boolean): string {
  const m = String(method || "").toLowerCase();
  if (m.includes("online") || m.includes("kart") && collected) return "Online Kredi/Banka Kartı";
  if (m.includes("kart") || m.includes("card") || m.includes("kredi")) return "Kredi/Banka Kartı";
  if (m.includes("nakit") || m.includes("cash")) return "Nakit";
  return collected ? "Kredi/Banka Kartı" : "Nakit";
}

function productName(item: any): string {
  const p = item?.products;
  if (Array.isArray(p)) return String(p[0]?.name ?? "Ürün");
  return String(p?.name ?? "Ürün");
}

export function buildHemenyoldaPayload(order: any, items: any[]): HemenyoldaOrderPayload {
  const noteParts: string[] = [];
  if (order.delivery_note) noteParts.push(String(order.delivery_note));
  if (order.notes) noteParts.push(String(order.notes));

  const products = (items || []).map((it: any) => {
    const qty = Math.max(1, Math.round(num(it.quantity)));
    const unit = num(it.unit_price);
    const opts: Array<{ name: string }> = [];
    if (it.notes) opts.push({ name: String(it.notes) });
    return {
      id: String(it.product_id || it.id),
      name: productName(it),
      price: unit,
      quantity: qty,
      options: opts.length > 0 ? opts : null,
    };
  });

  const subtotal = num(order.subtotal) || products.reduce((s, p) => s + p.price * p.quantity, 0);
  const total = num(order.total_amount) || subtotal;
  const discount = subtotal > total && total > 0 ? subtotal - total : null;

  const courierPhone = order.courier_phone
    ? normalizePhone(order.courier_phone)
    : null;

  return {
    order: {
      id: String(order.id),
      customer: {
        fullName: String(order.customer_name || "Müşteri").trim() || "Müşteri",
        phoneNumber: normalizePhone(order.customer_phone) || "5000000000",
        phoneCode: null,
      },
      address: {
        text: String(order.delivery_address || "Adres belirtilmedi").trim(),
        description: noteParts.length > 0 ? noteParts.join(" | ") : null,
        lat: null,
        lon: null,
      },
      products,
      source: "Telefon",
      note: noteParts.length > 0 ? noteParts.join(" | ") : null,
      totalAmount: Math.round(total * 100) / 100,
      totalDiscount: discount != null ? Math.round(discount * 100) / 100 : null,
      paymentMethod: mapPaymentMethod(order.payment_method, Boolean(order.payment_collected)),
      platformCode: null,
      dailyOrderNo: order.order_number != null ? String(order.order_number) : null,
      createdAt: formatUtc(order.created_at) || formatUtc(new Date().toISOString())!,
      scheduledAt: null,
      courierPhone: courierPhone || null,
    },
  };
}

export function buildCancelPayload(orderId: string): { order: { id: string } } {
  return { order: { id: orderId } };
}

export function endpointPath(action: HemenyoldaAction): string {
  switch (action) {
    case "new":
      return "new-order";
    case "update":
      return "updated-order";
    case "cancel":
      return "canceled-order";
  }
}
