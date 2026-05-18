// supabase/functions/getir-webhook/index.ts
//
// Getir → ŞefPOS webhook gateway.
// - `?type=new` | `?type=cancel` (geriye uyumlu)
// - Gövdede `eventType` / `event` (NEW_ORDER, CONFIRMED, …) varsa merkezi enum eşlemesi uygulanır.
//
// Authentication: x-api-key → online_order_platforms.getir_x_api_key
// verify_jwt = false — service_role ile yazar.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  canTransitionGetir,
  clampGetirStatusUntilPosAck,
  extractGetirCourier,
  resolveWebhookTargetStatus,
  sha256DedupeKeyPart,
} from "../_shared/getirOrderStatus.ts";

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

function isDuplicateKeyError(err: any): boolean {
  return err?.code === "23505" || String(err?.message || "").includes("duplicate key");
}

async function buildDedupeKey(
  platformId: string,
  platformOrderId: string,
  urlType: string,
  body: any,
): Promise<string> {
  const explicit =
    body?.eventId ?? body?.messageId ?? body?.webhookId ?? body?.deliveryId ?? body?.id;
  if (explicit) return `${platformId}:${String(explicit).slice(0, 200)}`;
  const raw = JSON.stringify({
    t: urlType,
    o: platformOrderId,
    e: body?.eventType ?? body?.event ?? "",
    s: body?.order?.status ?? body?.data?.order?.status ?? "",
    ts: body?.timestamp ?? body?.createdAt ?? "",
  });
  const h = await sha256DedupeKeyPart(raw);
  return `${platformId}:${platformOrderId}:${h}`;
}

function isMissingObjectError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "").toLowerCase();
  // Postgres / PostgREST kodları:
  //   42P01 = undefined_table, 42703 = undefined_column, PGRST204 = column not found, PGRST205 = relation not found
  return (
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "PGRST204" ||
    err.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find") ||
    msg.includes("schema cache")
  );
}

async function tryInsertWebhookDedupe(
  admin: any,
  platformId: string,
  platformOrderId: string,
  dedupeKey: string,
  rawBody: any,
): Promise<boolean> {
  const { error } = await admin.from("getir_webhook_event_log").insert({
    platform_id: platformId,
    platform_order_id: platformOrderId,
    dedupe_key: dedupeKey.slice(0, 250),
    raw_body: rawBody,
  });
  if (error && isDuplicateKeyError(error)) {
    console.info("[getir-webhook] duplicate event skipped:", dedupeKey.slice(0, 80));
    return false;
  }
  if (error && isMissingObjectError(error)) {
    console.warn("[getir-webhook] getir_webhook_event_log tablosu yok — dedupe atlandı (migration uygulayın).");
    return true;
  }
  if (error) {
    console.error("[getir-webhook] dedupe insert error:", error);
    // Eski davranışı koru: dedupe kaydedilemese bile siparişi işle.
    return true;
  }
  return true;
}

async function appendStatusEvent(
  admin: any,
  opts: {
    tenantId: string;
    onlineOrderId: string;
    fromStatus: string | null;
    toStatus: string;
    platformEnum: string | null;
    numericCode: number | null;
    source: string;
    payload: any;
    dedupeKey: string;
  },
): Promise<void> {
  const dk = opts.dedupeKey.slice(0, 250);
  const { error } = await admin.from("online_order_status_events").insert({
    tenant_id: opts.tenantId,
    online_order_id: opts.onlineOrderId,
    from_status: opts.fromStatus,
    to_status: opts.toStatus,
    getir_platform_order_status: opts.platformEnum,
    getir_status_code: opts.numericCode,
    source: opts.source,
    event_payload: opts.payload,
    dedupe_key: dk,
  });
  if (error && isDuplicateKeyError(error)) return;
  if (error && isMissingObjectError(error)) {
    console.warn("[getir-webhook] online_order_status_events tablosu yok — status history atlandı.");
    return;
  }
  if (error) console.warn("[getir-webhook] status event insert:", error?.message || error);
}

/**
 * Bilinen yeni kolonları satırdan ayıklayarak fallback üretir.
 * Migration henüz uygulanmamış Supabase için "kolon yok" hatasından sonra deneriz.
 */
function stripNewGetirColumns<T extends Record<string, any>>(row: T): Record<string, any> {
  const clone: Record<string, any> = { ...row };
  delete clone.getir_courier_name;
  delete clone.getir_courier_phone;
  delete clone.getir_courier_pickup_at;
  delete clone.getir_platform_order_status;
  return clone;
}

function applyLifecycleTimestamps(patch: Record<string, any>, toStatus: string, nowIso: string) {
  if (toStatus === "verified" || toStatus === "accepted" || toStatus === "scheduled_accepted") {
    patch.accepted_at = nowIso;
  }
  if (toStatus === "ready") patch.ready_at = nowIso;
  if (toStatus === "delivered") patch.delivered_at = nowIso;
  if (toStatus === "cancelled" || toStatus === "rejected") patch.cancelled_at = nowIso;
}

function buildOrderRow(
  platform: PlatformRow,
  order: any,
  target: { internalStatus: string; platformEnum: string | null; numericCode: number | null; labelTr: string },
): Record<string, any> {
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
  const courier = extractGetirCourier(order);

  return {
    tenant_id: platform.tenant_id,
    platform_id: platform.id,
    platform_order_id: String(order.id || order._id),
    platform_order_number: String(order.orderNumber || order.confirmationId || ""),
    customer_name: customerName,
    customer_phone: maskedPhone || null,
    customer_address: address || null,
    customer_notes: order.note || order.clientNote || order.clientRequest || null,
    subtotal,
    delivery_fee: Number(order.deliveryFee ?? 0),
    discount_amount: totalDiscount,
    total_amount: discounted || subtotal,
    status: target.internalStatus,
    payment_status: "paid",
    platform_created_at: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    getir_status_code: target.numericCode,
    getir_platform_order_status: target.platformEnum,
    getir_is_scheduled: !!order.isScheduled,
    getir_scheduled_at: order.scheduledDate ? new Date(order.scheduledDate).toISOString() : null,
    getir_delivery_type: Number(order.deliveryType ?? 0) || null,
    getir_verification_code: String(order.confirmationId || ""),
    getir_masked_phone: maskedPhone || null,
    getir_supplier_support_rate: Number(order.supplierSupportRate ?? 0) || null,
    getir_total_discount: totalDiscount || null,
    getir_total_discounted_price: discounted || null,
    getir_raw_payload: order,
    getir_courier_name: courier.name,
    getir_courier_phone: courier.phone,
    getir_courier_pickup_at: courier.pickupAt,
  };
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
    console.warn("[getir-webhook] inaktif platform'a webhook geldi:", platform.id);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return ok({ ok: false, error: "JSON parse hatasi" }, 400);
  }

  const order = body?.order || body?.data?.order || body?.data || body;
  if (!order || (!order.id && !order._id)) {
    return ok({ ok: false, error: "payload icinde order yok" }, 400);
  }

  const platformOrderId = String(order.id || order._id);

  let dedupeKey: string;
  try {
    dedupeKey = await buildDedupeKey(platform.id, platformOrderId, type, body);
  } catch (e: any) {
    console.error("[getir-webhook] dedupe key:", e);
    return ok({ ok: false, error: "dedupe key uretilemedi" }, 500);
  }

  try {
    const fresh = await tryInsertWebhookDedupe(admin, platform.id, platformOrderId, dedupeKey, body);
    if (!fresh) {
      return ok({ ok: true, duplicate: true, platformOrderId });
    }
  } catch {
    return ok({ ok: false, error: "dedupe kaydi basarisiz" }, 500);
  }

  const nowIso = new Date().toISOString();

  if (type === "cancel") {
    const upd: Record<string, any> = {
      status: "cancelled",
      cancelled_at: nowIso,
      getir_status_code: Number(order.status || 1500) || 1600,
      getir_platform_order_status: "CANCELLED",
      getir_cancel_reason_id: order.cancelReasonId || null,
      getir_cancel_note: order.cancelNote || null,
      getir_raw_payload: order,
    };
    const { data: row } = await admin
      .from("online_orders")
      .select("id, status, tenant_id")
      .eq("platform_id", platform.id)
      .eq("platform_order_id", platformOrderId)
      .maybeSingle();
    let { error: cancErr } = await admin
      .from("online_orders")
      .update(upd)
      .eq("platform_id", platform.id)
      .eq("platform_order_id", platformOrderId);
    if (cancErr && isMissingObjectError(cancErr)) {
      console.warn("[getir-webhook] cancel update kolon eksik, fallback deniyor:", cancErr.message);
      ({ error: cancErr } = await admin
        .from("online_orders")
        .update(stripNewGetirColumns(upd))
        .eq("platform_id", platform.id)
        .eq("platform_order_id", platformOrderId));
    }
    if (cancErr) console.error("[getir-webhook] cancel update hatasi:", cancErr);
    if (row?.id) {
      await appendStatusEvent(admin, {
        tenantId: row.tenant_id,
        onlineOrderId: row.id,
        fromStatus: row.status,
        toStatus: "cancelled",
        platformEnum: "CANCELLED",
        numericCode: upd.getir_status_code,
        source: "webhook",
        payload: body,
        dedupeKey: `${dedupeKey}:cancel`,
      });
    }
    return ok({ ok: true, type: "cancel" });
  }

  const target = resolveWebhookTargetStatus(body, order, type);

  const { data: existing } = await admin
    .from("online_orders")
    .select("id, status, tenant_id, getir_status_code, accepted_at")
    .eq("platform_id", platform.id)
    .eq("platform_order_id", platformOrderId)
    .maybeSingle();

  const storageStatus = clampGetirStatusUntilPosAck({
    acceptedAt: (existing as any)?.accepted_at,
    mappedStatus: target.internalStatus,
    isScheduled: !!order.isScheduled,
  });

  if (!existing) {
    const row = buildOrderRow(platform as PlatformRow, order, target);
    row.status = storageStatus;
    applyLifecycleTimestamps(row, storageStatus, nowIso);
    let { data: ins, error: upErr } = await admin
      .from("online_orders")
      .upsert(row, { onConflict: "tenant_id,platform_id,platform_order_id" })
      .select("id, tenant_id")
      .maybeSingle();
    if (upErr && isMissingObjectError(upErr)) {
      console.warn("[getir-webhook] insert kolon eksik, fallback deniyor:", upErr.message);
      ({ data: ins, error: upErr } = await admin
        .from("online_orders")
        .upsert(stripNewGetirColumns(row), { onConflict: "tenant_id,platform_id,platform_order_id" })
        .select("id, tenant_id")
        .maybeSingle());
    }
    if (upErr) {
      console.error("[getir-webhook] insert hatasi:", upErr);
      return ok({ ok: false, error: upErr.message }, 500);
    }
    if (ins?.id) {
      await appendStatusEvent(admin, {
        tenantId: ins.tenant_id,
        onlineOrderId: ins.id,
        fromStatus: null,
        toStatus: storageStatus,
        platformEnum: target.platformEnum,
        numericCode: target.numericCode,
        source: "webhook",
        payload: body,
        dedupeKey: `${dedupeKey}:status`,
      });
    }
    return ok({ ok: true, type: "new", created: true, platformOrderId });
  }

  if ((existing as any).accepted_at) {
    const tr = canTransitionGetir(existing.status, storageStatus);
    if (!tr.ok) {
      console.warn(
        "[getir-webhook] transition blocked:",
        existing.status,
        "->",
        storageStatus,
        tr.reason,
      );
      return ok({
        ok: true,
        skipped: tr.reason,
        from: existing.status,
        to: storageStatus,
        platformOrderId,
      });
    }
  }

  const courier = extractGetirCourier(order);
  const patch: Record<string, any> = {
    status: storageStatus,
    getir_status_code: target.numericCode,
    getir_platform_order_status: target.platformEnum,
    getir_raw_payload: order,
    updated_at: nowIso,
  };
  if (courier.name) patch.getir_courier_name = courier.name;
  if (courier.phone) patch.getir_courier_phone = courier.phone;
  if (courier.pickupAt) patch.getir_courier_pickup_at = courier.pickupAt;
  applyLifecycleTimestamps(patch, storageStatus, nowIso);

  let { error: uErr } = await admin
    .from("online_orders")
    .update(patch)
    .eq("id", existing.id);
  if (uErr && isMissingObjectError(uErr)) {
    console.warn("[getir-webhook] update kolon eksik, fallback deniyor:", uErr.message);
    ({ error: uErr } = await admin
      .from("online_orders")
      .update(stripNewGetirColumns(patch))
      .eq("id", existing.id));
  }
  if (uErr) {
    console.error("[getir-webhook] update hatasi:", uErr);
    return ok({ ok: false, error: uErr.message }, 500);
  }

  await appendStatusEvent(admin, {
    tenantId: existing.tenant_id,
    onlineOrderId: existing.id,
    fromStatus: existing.status,
    toStatus: storageStatus,
    platformEnum: target.platformEnum,
    numericCode: target.numericCode,
    source: "webhook",
    payload: body,
    dedupeKey: `${dedupeKey}:status`,
  });

  return ok({ ok: true, type: "status", platformOrderId, to: target.internalStatus });
});
