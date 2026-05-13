// supabase/functions/getir-webhook/index.ts
//
// Getir → ŞefPOS webhook gateway. (v1.0.10) Getir bu URL'e iki tip POST gonderir:
//
//   ?type=new      → Yeni sipariş geldi
//   ?type=cancel   → Sipariş iptal edildi (Getir veya musteri tarafindan)
//
// Authentication: Getir x-api-key header'i gonderir; biz online_order_platforms
// satirindaki getir_x_api_key ile karsilastiririz. Eslesmezse 401.
//
// Tenant secimi: x-api-key her tenant icin tekildir; secret ile platform satirini
// buluyor → tenant_id otomatik gelir.
//
// Bu fonksiyon "verify_jwt = false" ile deploy edilir (public). RLS bypass icin
// service_role kullanir.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key, X-Api-Key",
};

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface PlatformRow {
  id: string;
  tenant_id: string;
  getir_x_api_key: string | null;
  is_active: boolean | null;
}

/**
 * Getir resmi status kodlari → ŞefPOS normalize edilmis durum.
 *   325 → new           (yeni, verify bekleniyor)
 *   350 → scheduled_new (yeni ileri tarihli)
 *   400 → verified      (verify yapildi, prepare bekleniyor)
 *   410 → preparing     (prepare yapildi, hazirlaniyor)
 *   500 → ready         (hazir, handover bekleniyor)
 *   550 → handed_over   (kurye aldi)
 *   600/700 → on_the_way (yolda)
 *   800 → arrived       (teslim noktasinda)
 *   900 → delivered     (teslim edildi)
 *   1500/1600 → cancelled
 */
/** Multi-language string normalize: { tr, en } objelerini string'e cevirir */
function extractLocalized(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    return String(
      val.tr ?? val.TR ?? val.text ?? val.value ?? val.default ??
        Object.values(val).find((v) => typeof v === "string") ?? "",
    );
  }
  return String(val);
}

function normalizeStatus(getirCode: number): string {
  switch (getirCode) {
    case 325: return "new";
    case 350: return "scheduled_new";
    case 400: return "verified";
    case 410: return "preparing";
    case 500: return "ready";
    case 550: return "handed_over";
    case 600: case 700: return "on_the_way";
    case 800: return "arrived";
    case 900: return "delivered";
    case 1500: case 1600: return "cancelled";
    default: return "new";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return ok({ ok: false, error: "POST required" }, 405);
  }

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "new").toLowerCase();

  const apiKey = req.headers.get("x-api-key") || req.headers.get("X-Api-Key") || "";
  if (!apiKey) {
    return ok({ ok: false, error: "x-api-key gerekli" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, supabaseService);

  // x-api-key ile platform satirini bul
  const { data: platform, error: pErr } = await admin
    .from("online_order_platforms")
    .select("id,tenant_id,getir_x_api_key,is_active")
    .eq("getir_x_api_key", apiKey)
    .eq("platform_code", "getir")
    .maybeSingle();
  if (pErr || !platform) {
    return ok({ ok: false, error: "x-api-key tanimsiz veya tenant pasif" }, 401);
  }
  if (platform.is_active === false) {
    // Inactive olsa bile sipariş kaybı olmasin diye kaydı yine yaparız;
    // ama log icin not düşelim.
    console.warn("[getir-webhook] inaktif platform'a webhook geldi:", platform.id);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ok({ ok: false, error: "JSON parse hatasi" }, 400);
  }

  // Getir webhook'larinda payload bazen { order: {...} }, bazen direkt {...}
  const order = body?.order || body?.data?.order || body?.data || body;
  if (!order || (!order.id && !order._id)) {
    return ok({ ok: false, error: "payload icinde order yok" }, 400);
  }

  const platformOrderId = String(order.id || order._id);

  if (type === "cancel") {
    // Iptal — mevcut kaydi guncelle veya ekle
    const upd = {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      getir_status_code: Number(order.status || 1500) || 1600,
      getir_cancel_reason_id: order.cancelReasonId || null,
      getir_cancel_note: order.cancelNote || null,
      getir_raw_payload: order,
    };
    await admin
      .from("online_orders")
      .update(upd)
      .eq("platform_id", platform.id)
      .eq("platform_order_id", platformOrderId);
    return ok({ ok: true, type: "cancel" });
  }

  // Yeni sipariş — upsert
  const customer = order.client || order.customer || {};
  const customerName = extractLocalized(customer.name || customer.firstName) || "Getir Musteri";
  const maskedPhone = String(customer.maskedPhoneNumber || customer.phoneNumber || "");
  const addressObj = order.address || customer.address || {};
  const address = [
    addressObj.address,
    addressObj.aptNo ? `Daire: ${addressObj.aptNo}` : null,
    addressObj.floor ? `Kat: ${addressObj.floor}` : null,
    addressObj.directions ? `(${addressObj.directions})` : null,
  ].filter(Boolean).join(", ");

  const subtotal = Number(order.totalPrice ?? 0);
  const discounted = Number(order.totalDiscountedPrice ?? order.totalPrice ?? 0);
  const totalDiscount = Math.max(0, subtotal - discounted);

  // Yeni webhook (?type=new) — Onay daima ŞefPOS kullanıcısında.
  // Getir test paneli bazen payload icinde status=400 (verified) yolluyor;
  // buna guvenip "onaylandi" diye DB'ye yazarsak sipariş ŞefPOS'ta otomatik
  // onaylanmis goruluyor ama Getir panelinde hala "Onayla" bekliyor (cunku
  // hicbir verify cagrisi yapilmadi). Bu kafa karistirici durumu engellemek
  // icin webhook ile gelen YENI siparisleri zorla 325/350'ye sabitliyoruz.
  // Eger order zaten ŞefPOS DB'sinde varsa ve mevcut durumu daha ilerideyse
  // (preparing/ready/...) onu BOZMAYIZ — sadece taze gelenler icin geri at.
  const isScheduled = !!order.isScheduled;
  const statusCode = isScheduled ? 350 : 325;
  const normalized = normalizeStatus(statusCode);

  const row: Record<string, any> = {
    tenant_id: platform.tenant_id,
    platform_id: platform.id,
    platform_order_id: platformOrderId,
    platform_order_number: String(order.orderNumber || order.confirmationId || ""),
    customer_name: customerName,
    customer_phone: maskedPhone || null,
    customer_address: address || null,
    customer_notes: order.note || null,
    subtotal,
    delivery_fee: Number(order.deliveryFee ?? 0),
    discount_amount: totalDiscount,
    total_amount: discounted || subtotal,
    status: normalized,
    payment_status: "paid",
    platform_created_at: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    getir_status_code: statusCode,
    getir_is_scheduled: !!order.isScheduled,
    getir_scheduled_at: order.scheduledDate ? new Date(order.scheduledDate).toISOString() : null,
    getir_delivery_type: Number(order.deliveryType ?? 0) || null,
    getir_verification_code: String(order.confirmationId || ""),
    getir_masked_phone: maskedPhone || null,
    getir_supplier_support_rate: Number(order.supplierSupportRate ?? 0) || null,
    getir_total_discount: totalDiscount || null,
    getir_total_discounted_price: discounted || null,
    getir_raw_payload: order,
  };

  const { data: existing } = await admin
    .from("online_orders")
    .select("id, status, getir_status_code")
    .eq("platform_id", platform.id)
    .eq("platform_order_id", platformOrderId)
    .maybeSingle();

  const isFirstTime = !existing;

  // Mevcut sipariş ilerideyse webhook ile geri sarma; sadece yeni gelenler.
  if (
    existing &&
    typeof existing.getir_status_code === "number" &&
    existing.getir_status_code > statusCode
  ) {
    return ok({ ok: true, type: "new", isFirstTime: false, skipped: "existing-newer" });
  }

  const { error: upErr } = await admin
    .from("online_orders")
    .upsert(row, { onConflict: "tenant_id,platform_id,platform_order_id" });

  if (upErr) {
    console.error("[getir-webhook] upsert hatasi:", upErr);
    return ok({ ok: false, error: upErr.message }, 500);
  }

  // Mutfak fişi: ŞefPOS istemcisi (OnlineOrders) açıkken printKitchenReceipts
  // ile basılır — edge print_jobs ile mükerrer ve RLS riski olmaması için burada kuyruk yok.

  return ok({ ok: true, type: "new", isFirstTime });
});
