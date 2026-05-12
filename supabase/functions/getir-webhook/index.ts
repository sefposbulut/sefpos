// supabase/functions/getir-webhook/index.ts
//
// Getir → ŞefPOS webhook gateway. Getir bu URL'e iki tip POST gonderir:
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

function normalizeStatus(getirCode: number): string {
  switch (getirCode) {
    case 325: case 400: return "new";
    case 350: return "scheduled_accepted";
    case 500: return "preparing";
    case 550: return "ready";
    case 600: case 700: return "handed_over";
    case 800: return "arrived";
    case 900: return "delivered";
    case 1500: case 1600: return "cancelled";
    default: return "new";
  }
}

/**
 * Mutfak fişini print_jobs kuyruğuna at. Electron Print Agent
 * tenant_id'sine gore polling yapacak ve mutfak yazicisina gonderecek.
 * Burada mutfak yazicisi adi belirtmiyoruz (boş string) — Electron tarafi
 * pickDefaultKitchenPrinter() ile varsayilani secer.
 */
async function queueKitchenReceipt(
  admin: any,
  tenantId: string,
  order: any,
): Promise<void> {
  // Yapilacak: getir-spesifik HTML uret. Su anlik basit bir template ile baslayalim
  // — productions'da printService.ts icindeki buildGetirReceiptHtml'i clone ederiz.
  const lines = (order.products || []).map((p: any) => {
    const opts = Array.isArray(p.options)
      ? p.options.map((o: any) => o.name || o.text || "").filter(Boolean).join(", ")
      : "";
    const note = p.note ? ` (Not: ${p.note})` : "";
    return `${p.count || p.quantity || 1}x ${p.name}${opts ? ` [${opts}]` : ""}${note}`;
  }).join("<br/>");

  const code = order.confirmationId || order.verificationCode || "";
  const phone = order.client?.maskedPhoneNumber || order.customer?.maskedPhoneNumber || "";
  const customer = order.client?.name || order.customer?.name || "Getir Musteri";
  const total = Number(order.totalDiscountedPrice ?? order.totalPrice ?? 0);
  const discount = Number(order.totalPrice ?? 0) - total;
  const supSup = Number(order.supplierSupportRate ?? 0);
  const isScheduled = !!order.isScheduled;
  const deliveryType = Number(order.deliveryType ?? 0);
  const addr = order.address?.address || "";

  const html = `
<style>
  .gtr { font-family: Arial, sans-serif; width: 72mm; padding: 2mm; color: #000; }
  .gtr .h { text-align: center; font-weight: 900; font-size: 18px; letter-spacing: 2px; padding: 4px 0; border: 2px solid #000; margin-bottom: 4px; }
  .gtr .row { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; margin: 1px 0; }
  .gtr .label { font-weight: 800; }
  .gtr .box { border: 1px solid #000; padding: 4px 6px; margin: 4px 0; font-size: 12px; }
  .gtr .vcode { font-size: 26px; font-weight: 900; text-align: center; letter-spacing: 4px; padding: 4px 0; border: 2px solid #000; margin: 4px 0; }
  .gtr .items { font-size: 13px; line-height: 1.4; margin: 6px 0; padding: 4px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-weight: 700; }
  .gtr .total { font-size: 15px; font-weight: 900; text-align: right; margin-top: 4px; }
  .gtr .note { background: #ffe66b; padding: 4px 6px; font-weight: 800; font-size: 12px; margin: 4px 0; border: 1px solid #000; }
  .gtr .small { font-size: 11px; }
</style>
<div class="gtr">
  <div class="h">GETIR YEMEK</div>
  <div class="row"><span class="label">Sipariş:</span><span>${order.orderNumber || order.confirmationId || ""}</span></div>
  <div class="row"><span class="label">Tarih:</span><span>${order.createdAt ? new Date(order.createdAt).toLocaleString("tr-TR") : new Date().toLocaleString("tr-TR")}</span></div>
  <div class="row"><span class="label">Teslimat:</span><span>${deliveryType === 1 ? "Getir Kurye" : deliveryType === 2 ? "Restoran Kurye" : "—"}</span></div>
  ${isScheduled ? `<div class="row"><span class="label">İleri Tarih:</span><span>${order.scheduledDate ? new Date(order.scheduledDate).toLocaleString("tr-TR") : ""}</span></div>` : ""}

  ${code ? `<div class="vcode">${code}</div>` : ""}

  <div class="box">
    <div><span class="label">Müşteri:</span> ${customer}</div>
    ${phone ? `<div><span class="label">Telefon:</span> ${phone}</div>` : ""}
    ${addr ? `<div><span class="label">Adres:</span> ${addr}</div>` : ""}
  </div>

  <div class="items">${lines || "(urun yok)"}</div>

  ${order.note ? `<div class="note">SİPARİŞ NOTU: ${order.note}</div>` : ""}

  ${discount > 0 ? `<div class="row small"><span>Ara Toplam:</span><span>${(order.totalPrice ?? 0).toFixed(2)} TL</span></div>` : ""}
  ${discount > 0 ? `<div class="row small"><span>${supSup ? "Ortak Kampanya" : "İndirim"} (-):</span><span>${discount.toFixed(2)} TL</span></div>` : ""}
  <div class="total">TOPLAM: ${total.toFixed(2)} TL</div>

  <div class="small" style="text-align:center;margin-top:6px">GetirYemek tarafından gönderildi</div>
</div>
`;
  await admin.from("print_jobs").insert({
    tenant_id: tenantId,
    html,
    printer_name: "", // Electron Print Agent default kitchen printer'i secer
    status: "pending",
  });
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
  const customerName = String(customer.name || customer.firstName || "Getir Musteri");
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
  const statusCode = Number(order.status ?? 400);
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
    .select("id, status")
    .eq("platform_id", platform.id)
    .eq("platform_order_id", platformOrderId)
    .maybeSingle();

  const isFirstTime = !existing;

  const { error: upErr } = await admin
    .from("online_orders")
    .upsert(row, { onConflict: "tenant_id,platform_id,platform_order_id" });

  if (upErr) {
    console.error("[getir-webhook] upsert hatasi:", upErr);
    return ok({ ok: false, error: upErr.message }, 500);
  }

  // Sadece ilk geldiginde mutfak fisini kuyruğa at
  if (isFirstTime) {
    try {
      await queueKitchenReceipt(admin, platform.tenant_id, order);
    } catch (e: any) {
      console.warn("[getir-webhook] print_jobs queue uyarisi:", e?.message);
    }
  }

  return ok({ ok: true, type: "new", isFirstTime });
});
