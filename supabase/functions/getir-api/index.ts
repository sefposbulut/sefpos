// supabase/functions/getir-api/index.ts
//
// ŞefPOS ↔ GetirYemek Restaurant API koprusu. (v1.0.10)
//
// Tum Getir API cagrilari ŞefPOS UI'sindan / cron job'undan bu Edge Function
// uzerinden gecer. Boylece:
//   - appSecretKey ve restaurantSecretKey hicbir zaman tarayicida olmaz
//   - token DB'de cache'lenir (1 saat TTL — Getir tarafi gerekirse 410/401 verir, biz refresh ederiz)
//   - CORS browser cagrilarini bozmaz
//   - rate limit ihlali butun tenant'lara yayilmaz
//
// Kullanim ornegi (frontend):
//   POST /functions/v1/getir-api
//   { "platformId": "<uuid>", "action": "verify", "orderId": "<getirOrderId>" }
//
// Tum actionlar:
//   pos-status-get | pos-status-set        (token gerekmez)
//   login                                  (manual refresh — normalde otomatik)
//   poll-active | poll-unapproved | poll-cancelled
//   verify | verify-scheduled
//   prepare | handover | deliver | cancel
//   restaurant-status-open | restaurant-status-close
//   product-status-set | option-product-set
//   restaurant-busy
//   menu-get
//
// Authorization:
//   Bu fonksiyon "verify_jwt = true" ile deploy edilir → istek atan kullanicinin
//   JWT'si Supabase tarafindan dogrulanir; biz sadece tenant_id'yi profile'dan okuruz.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { extractGetirCourier, resolveFromNumeric, resolveFromPlatformEnum, clampGetirStatusUntilPosAck } from "../_shared/getirOrderStatus.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Client-Info, Apikey",
};

const GETIR_DEV_URL = "https://food-external-api-gateway.development.getirapi.com";
const GETIR_PROD_URL = "https://food-external-api-gateway.getirapi.com";

interface PlatformRow {
  id: string;
  tenant_id: string;
  getir_environment: string | null;
  getir_app_secret_key: string | null;
  getir_restaurant_secret_key: string | null;
  getir_restaurant_id: string | null;
  getir_token: string | null;
  getir_token_expires_at: string | null;
  getir_pos_status: number | null;
  settings: Record<string, any> | null;
  api_key: string | null;
}

interface ActionRequest {
  platformId: string;
  action: string;
  orderId?: string;
  productId?: string;
  chainProductId?: string;
  optionProductId?: string;
  cancelReasonId?: string;
  cancelNote?: string;
  status?: number; // open/close: 100|200
  isBusy?: boolean;
  busynessDifferenceDuration?: number; // 15|30|45
  timeOffAmount?: number; // 15|30|45
  payload?: Record<string, any>; // freeform forward
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(msg: string): Response {
  return jsonResponse({ ok: false, error: msg }, 400);
}

function serverError(msg: string, extra?: Record<string, unknown>): Response {
  return jsonResponse({ ok: false, error: msg, ...extra }, 500);
}

function getirBaseUrl(env: string | null | undefined): string {
  return (env || "development").toLowerCase() === "production"
    ? GETIR_PROD_URL
    : GETIR_DEV_URL;
}

/**
 * Yardımcı: platform satirini oku ve credentials'i normalize et.
 * Eski entegrasyonlarda credentials settings JSONB icinde olabilir;
 * yeni kolonlarda yoksa fallback yapilir.
 */
function normalizeCredentials(row: PlatformRow): {
  appSecretKey: string;
  restaurantSecretKey: string;
  restaurantId: string;
  environment: string;
} {
  const s = row.settings || {};
  const appSecretKey =
    (row.getir_app_secret_key && row.getir_app_secret_key.trim()) ||
    (s.app_secret_key && String(s.app_secret_key).trim()) ||
    "";
  const restaurantSecretKey =
    (row.getir_restaurant_secret_key && row.getir_restaurant_secret_key.trim()) ||
    (s.restaurant_secret_key && String(s.restaurant_secret_key).trim()) ||
    "";
  const restaurantId =
    (row.getir_restaurant_id && row.getir_restaurant_id.trim()) ||
    (s.restaurant_id && String(s.restaurant_id).trim()) ||
    "";
  const environment = (row.getir_environment || "development").trim();
  return { appSecretKey, restaurantSecretKey, restaurantId, environment };
}

/**
 * Token alir veya refresh eder. DB'ye yazar.
 * Getir spec: token TTL = 1 saat. Biz 55 dakikada bir refresh ederiz.
 */
async function ensureToken(
  admin: any,
  platform: PlatformRow,
  forceRefresh = false,
): Promise<{ token: string; baseUrl: string } | { error: string; status: number }> {
  const creds = normalizeCredentials(platform);
  if (!creds.appSecretKey || !creds.restaurantSecretKey) {
    return { error: "appSecretKey ve restaurantSecretKey tanimli degil", status: 400 };
  }
  const baseUrl = getirBaseUrl(creds.environment);

  // Token gecerliyse kullan
  if (!forceRefresh && platform.getir_token && platform.getir_token_expires_at) {
    const exp = new Date(platform.getir_token_expires_at).getTime();
    if (exp - Date.now() > 60_000) {
      return { token: platform.getir_token, baseUrl };
    }
  }

  // Login (resmi spec'e gore body: appSecretKey + restaurantSecretKey)
  const resp = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appSecretKey: creds.appSecretKey,
      restaurantSecretKey: creds.restaurantSecretKey,
    }),
  });
  const text = await resp.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* keep raw */ }
  if (!resp.ok) {
    return { error: `login basarisiz (${resp.status}): ${text.slice(0, 300)}`, status: resp.status };
  }
  // Getir response sekli: { token: "..." } veya { data: { token: "..." } }
  const token: string | undefined = data?.token || data?.data?.token || data?.accessToken;
  if (!token) {
    return { error: "login response icinde token yok", status: 502 };
  }
  const expiresAt = new Date(Date.now() + 55 * 60_000).toISOString();
  await admin
    .from("online_order_platforms")
    .update({ getir_token: token, getir_token_expires_at: expiresAt })
    .eq("id", platform.id);

  return { token, baseUrl };
}

/**
 * Authenticated Getir API call helper. 401 alirsa bir kez token refresh dener.
 */
async function callGetir(
  admin: any,
  platform: PlatformRow,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const tokenRes = await ensureToken(admin, platform);
  if ("error" in tokenRes) {
    return { ok: false, status: tokenRes.status, data: { error: tokenRes.error }, raw: "" };
  }
  const send = async (token: string) => {
    const resp = await fetch(`${tokenRes.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await resp.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    return { ok: resp.ok, status: resp.status, data, raw };
  };
  let res = await send(tokenRes.token);
  if (res.status === 401 || res.status === 403) {
    // Force refresh
    const tr2 = await ensureToken(admin, platform, true);
    if (!("error" in tr2)) {
      res = await send(tr2.token);
    }
  }
  return res;
}

/**
 * Gelen Getir order payload'ini online_orders + online_order_items tablosuna
 * idempotent sekilde upsert eder. Mevcut kayit varsa status guncellenir.
 * Durum eşlemesi: `../_shared/getirOrderStatus.ts`.
 *
 * Multi-language string'leri normalize et. Getir API bazen sade string,
 * bazen { tr: '...', en: '...' } sekilinde dondurur.
 */
function extractLocalized(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    return String(
      val.tr ?? val.TR ?? val.text ?? val.value ?? val.default ??
        Object.values(val).find((v) => typeof v === "string") ?? ""
    );
  }
  return String(val);
}

/**
 * verify / prepare / handover / deliver POST cevabinda gomulu siparis
 * nesnesini cikar. Getir cevap sekli degisken; tum bilinen bicimleri dene.
 */
function extractOrderFromGetirActionResponse(data: any): any | null {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.data,
    data.order,
    data.result,
    data.payload,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && (c.id || c._id)) return c;
  }
  return null;
}

function isDuplicateKeyError(err: any): boolean {
  return err?.code === "23505" || String(err?.message || "").includes("duplicate key");
}

/**
 * Getir Food API status code semantiği (özet):
 *   200/325 — yeni / zamanlanmış
 *   400     — restoran onayladı (verify sonrası)
 *   410     — hazırlanıyor (prepare sonrası)
 *   500     — hazır / kuryeye teslim edildi (handover sonrası)
 *   550/600/700 — kurye akışı (handover sonrası iç durum)
 *   800     — teslim edildi (deliver sonrası)
 *   900+    — iptal
 *
 * Bir aksiyon "tamamlanmış" sayılır ise Getir status'ü >= ACTION_COMPLETED[action]
 * olur. Bu, recover senaryolarında "zaten yapılmış" tespiti için.
 */
const ACTION_COMPLETED: Record<string, number> = {
  verify: 400,
  "verify-scheduled": 350,
  prepare: 410,
  handover: 500,
  deliver: 800,
};

/**
 * Bir aksiyon "invalid status" hatası verdiğinde, hangi önceki aksiyonu
 * otomatik çağırırsak hedef state'e ulaşırız? Yalnızca 1 adım recovery —
 * 2+ adım recovery test ortamında veriye dokunduğu için riskli.
 */
const PREV_ACTION: Record<string, string | null> = {
  verify: null,
  "verify-scheduled": null,
  prepare: null,
  handover: "prepare",
  deliver: "handover",
};

function isInvalidStatusError(data: any): boolean {
  const msg = String(data?.message || data?.error || "").toLowerCase();
  return (
    msg.includes("status is invalid") ||
    msg.includes("invalid status") ||
    msg.includes("invalid for given action")
  );
}

/**
 * Bir Getir aksiyonunu çalıştır; "invalid status" hatasında otomatik kurtarma:
 *   1) inquiry yap → gerçek Getir status'ünü öğren
 *   2) Cancelled (900+) → DB'yi cancelled yap, ok dön
 *   3) Already advanced (real >= target) → DB sync, ok dön (success kabul)
 *   4) 1 adım geride (örn handover ama Getir 400'de) → önceki aksiyonu (prepare) çağır,
 *      sonra hedef aksiyonu tekrar dene
 *   5) Recover edilemezse orijinal hatayı dön
 *
 * Bu sayede frontend tek bir aksiyon gönderir, server gerekirse zincirleme yapar;
 * inquiry rate-limit (429) baskısı oluşmaz, ŞefPOS UI Getir paneliyle senkron kalır.
 */
async function tryGetirActionWithRecovery(
  admin: any,
  platform: any,
  action: string,
  orderId: string,
  payload: any,
): Promise<{ ok: boolean; status: number; data: any; meta?: Record<string, any> }> {
  const path = `/food-orders/${encodeURIComponent(orderId)}/${action}`;
  const res = await callGetir(admin, platform, "POST", path, payload || {});
  if (res.ok) {
    return { ok: true, status: 200, data: res.data };
  }

  if (!isInvalidStatusError(res.data)) {
    return { ok: false, status: res.status, data: res.data };
  }

  // ---- Auto-recovery: inquiry ile gerçek state'i öğren ----
  const inq = await callGetir(
    admin,
    platform,
    "GET",
    `/food-orders/${encodeURIComponent(orderId)}`,
  );
  if (!inq.ok) {
    return {
      ok: false,
      status: res.status,
      data: res.data,
      meta: { recoveryFailed: true, reason: "inquiry-failed", inquiryStatus: inq.status },
    };
  }
  const ord = (inq.data as any)?.data || inq.data;
  if (!ord || typeof ord !== "object") {
    return { ok: false, status: res.status, data: res.data, meta: { recoveryFailed: true, reason: "empty-inquiry" } };
  }

  const rawCode = (ord as any).status;
  const realCode = typeof rawCode === "number" ? rawCode : Number(rawCode);

  await upsertGetirOrder(admin, platform, ord, { skipAckClamp: true });

  // 1) Getir tarafında iptal edilmiş → DB de iptal et, ok dön
  if (Number.isFinite(realCode) && realCode >= 900 && realCode < 1500) {
    const nowIso = new Date().toISOString();
    await admin
      .from("online_orders")
      .update({ status: "cancelled", cancelled_at: nowIso })
      .eq("platform_id", platform.id)
      .eq("platform_order_id", orderId)
      .is("cancelled_at", null);
    return {
      ok: true,
      status: 200,
      data: { recovered: true, cancelled: true, getirStatusCode: realCode },
      meta: { cancelled: true, realCode },
    };
  }

  // 2) Hedef aksiyon zaten yapılmış (Getir ileride) → DB sync edildi, success
  const targetCode = ACTION_COMPLETED[action];
  if (Number.isFinite(realCode) && typeof targetCode === "number" && realCode >= targetCode) {
    return {
      ok: true,
      status: 200,
      data: { recovered: true, alreadyDone: true, getirStatusCode: realCode },
      meta: { alreadyDone: true, realCode },
    };
  }

  // 3) 1 adım geride → önceki aksiyonu otomatik çağır, sonra hedef aksiyonu tekrar dene
  const prev = PREV_ACTION[action];
  if (prev) {
    const prevPath = `/food-orders/${encodeURIComponent(orderId)}/${prev}`;
    const prevRes = await callGetir(admin, platform, "POST", prevPath, {});
    if (prevRes.ok) {
      const prevEmbedded = extractOrderFromGetirActionResponse(prevRes.data);
      if (prevEmbedded) {
        await upsertGetirOrder(admin, platform, prevEmbedded, { skipAckClamp: true });
      }
      // Getir state'in oturması için kısa bekleme
      await new Promise((r) => setTimeout(r, 400));
      // Hedef aksiyonu tekrar dene
      const retry = await callGetir(admin, platform, "POST", path, payload || {});
      if (retry.ok) {
        return {
          ok: true,
          status: 200,
          data: retry.data,
          meta: { chained: prev, realCodeBefore: realCode },
        };
      }
      // Retry da invalid status verdi → recovery limitini aştık
      return {
        ok: false,
        status: retry.status,
        data: retry.data,
        meta: { chained: prev, retryFailed: true, realCodeBefore: realCode },
      };
    }
    return {
      ok: false,
      status: prevRes.status,
      data: prevRes.data,
      meta: { chainAttempted: prev, chainFailed: true, realCode },
    };
  }

  // 4) Recover edilemez → orijinal hatayı dön (frontend bilgilendirir)
  return {
    ok: false,
    status: res.status,
    data: res.data,
    meta: { realCode, behind: true },
  };
}

function isMissingObjectError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "").toLowerCase();
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

function stripNewGetirColumns<T extends Record<string, any>>(row: T): Record<string, any> {
  const clone: Record<string, any> = { ...row };
  delete clone.getir_courier_name;
  delete clone.getir_courier_phone;
  delete clone.getir_courier_pickup_at;
  delete clone.getir_platform_order_status;
  return clone;
}

function applyLifecycleTimestampsPoll(patch: Record<string, any>, toStatus: string, nowIso: string) {
  if (toStatus === "verified" || toStatus === "accepted" || toStatus === "scheduled_accepted") {
    patch.accepted_at = nowIso;
  }
  if (toStatus === "ready") patch.ready_at = nowIso;
  if (toStatus === "delivered") patch.delivered_at = nowIso;
  if (toStatus === "cancelled" || toStatus === "rejected") patch.cancelled_at = nowIso;
}

async function appendPollStatusEvent(
  admin: any,
  opts: {
    tenantId: string;
    onlineOrderId: string;
    fromStatus: string | null;
    toStatus: string;
    platformEnum: string | null;
    numericCode: number | null;
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
    source: "getir_poll",
    event_payload: opts.payload,
    dedupe_key: dk,
  });
  if (error && isDuplicateKeyError(error)) return;
  if (error && isMissingObjectError(error)) {
    console.warn("[getir-api] online_order_status_events tablosu yok — status history atlandı.");
    return;
  }
  if (error) console.warn("[getir-api] status event insert:", error?.message || error);
}

async function upsertGetirOrder(
  admin: any,
  platform: PlatformRow,
  order: any,
  opts?: { skipAckClamp?: boolean },
): Promise<{ id: string; isNew: boolean; statusCode: number | null; normalizedStatus: string } | null> {
  const platformOrderId = String(order.id || order._id || order.orderId || "");
  if (!platformOrderId) return null;

  const customer = order.client || order.customer || {};
  const products: any[] = Array.isArray(order.products) ? order.products : [];
  const customerName = extractLocalized(
    customer.name || customer.firstName || customer.fullName,
  ) || "Getir Musteri";
  // Gelen telefon zaten maskeli olabilir (0850...). Hem maskeli hem tam yedek hicbir zaman gelmez.
  const maskedPhone = String(customer.maskedPhoneNumber || customer.phoneNumber || customer.phone || "");
  const verificationCode = String(order.confirmationId || order.verificationCode || "");

  const addressObj = order.address || customer.address || {};
  const address = [
    addressObj.address,
    addressObj.aptNo ? `Daire: ${addressObj.aptNo}` : null,
    addressObj.floor ? `Kat: ${addressObj.floor}` : null,
    addressObj.directions ? `(${addressObj.directions})` : null,
  ].filter(Boolean).join(", ");

  const subtotal = Number(order.totalPrice ?? 0);
  const discounted = Number(order.totalDiscountedPrice ?? order.totalPrice ?? 0);
  const totalDiscount = subtotal && discounted ? Math.max(0, subtotal - discounted) : 0;
  const deliveryFee = Number(order.deliveryFee ?? 0);
  const supplierSupportRate = Number(order.supplierSupportRate ?? 0);

  const rawStatusVal = (order as any).status;
  const hasStatusVal = rawStatusVal != null && rawStatusVal !== "" && !isNaN(Number(rawStatusVal));
  const isSched = !!(order as any).isScheduled;

  let normalizedStatus: string;
  let statusCode: number | null;
  let platformEnum: string | null = null;

  if (typeof rawStatusVal === "string" && rawStatusVal.trim() && isNaN(Number(rawStatusVal))) {
    const r = resolveFromPlatformEnum(rawStatusVal, isSched);
    normalizedStatus = r.internalStatus;
    statusCode = r.numericCode;
    platformEnum = r.platformEnum;
  } else {
    const code = hasStatusVal ? Number(rawStatusVal) : (isSched ? 350 : 325);
    const r = resolveFromNumeric(code, isSched);
    normalizedStatus = r.internalStatus;
    statusCode = r.numericCode;
  }

  const courier = extractGetirCourier(order);
  const nowIso = new Date().toISOString();

  const { data: existing } = await admin
    .from("online_orders")
    .select("id, status, tenant_id, accepted_at")
    .eq("tenant_id", platform.tenant_id)
    .eq("platform_id", platform.id)
    .eq("platform_order_id", platformOrderId)
    .maybeSingle();
  const isNew = !existing?.id;

  const skipClamp = !!opts?.skipAckClamp;
  const effectiveStatus = skipClamp
    ? normalizedStatus
    : clampGetirStatusUntilPosAck({
      acceptedAt: existing?.accepted_at,
      mappedStatus: normalizedStatus,
      isScheduled: isSched,
    });

  // Getir resmi status kodlari (Food API doc):
  //   325 = New order (verify bekleniyor)
  //   350 = New scheduled order
  //   400 = Verified (prepare bekleniyor)
  //   410 = Preparing (prepare yapildi, hazirlaniyor)
  //   500 = Ready (handover bekleniyor)
  //   550 = Handed to courier (kurye aldi)
  //   600/700 = On the way (yolda)
  //   800 = Arrived (teslim noktasinda)
  //   900 = Delivered (teslim edildi)
  //   1500/1600 = Cancelled
  // Eşleme: ../_shared/getirOrderStatus.ts (tek kaynak).
  const baseRow: Record<string, any> = {
    tenant_id: platform.tenant_id,
    platform_id: platform.id,
    platform_order_id: platformOrderId,
    platform_order_number: String(order.orderNumber || order.confirmationId || ""),
    customer_name: customerName,
    customer_phone: maskedPhone || null,
    customer_address: address || null,
    customer_notes: order.note || order.clientNote || null,
    subtotal,
    delivery_fee: deliveryFee,
    discount_amount: totalDiscount,
    total_amount: discounted || subtotal,
    status: effectiveStatus,
    payment_status: "paid",
    platform_created_at: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    getir_status_code: statusCode,
    getir_platform_order_status: platformEnum,
    getir_is_scheduled: !!order.isScheduled,
    getir_scheduled_at: order.scheduledDate ? new Date(order.scheduledDate).toISOString() : null,
    getir_delivery_type: Number(order.deliveryType ?? 0) || null,
    getir_verification_code: verificationCode || null,
    getir_masked_phone: maskedPhone || null,
    getir_supplier_support_rate: supplierSupportRate || null,
    getir_total_discount: totalDiscount || null,
    getir_total_discounted_price: discounted || null,
    getir_raw_payload: order,
    getir_courier_name: courier.name,
    getir_courier_phone: courier.phone,
    getir_courier_pickup_at: courier.pickupAt,
  };

  applyLifecycleTimestampsPoll(baseRow, effectiveStatus, nowIso);

  let { data: upserted, error: upErr } = await admin
    .from("online_orders")
    .upsert(baseRow, { onConflict: "tenant_id,platform_id,platform_order_id" })
    .select("id, tenant_id")
    .maybeSingle();

  if (upErr && isMissingObjectError(upErr)) {
    console.warn("[getir-api] online_orders upsert kolon eksik, fallback deniyor:", upErr.message);
    ({ data: upserted, error: upErr } = await admin
      .from("online_orders")
      .upsert(stripNewGetirColumns(baseRow), { onConflict: "tenant_id,platform_id,platform_order_id" })
      .select("id, tenant_id")
      .maybeSingle());
  }

  if (upErr) {
    console.error("[getir-api] online_orders upsert hatasi:", upErr);
    return null;
  }
  const onlineOrderId: string = upserted?.id;
  if (!onlineOrderId) return null;

  const prevStatus = existing?.status ?? null;
  if (prevStatus !== effectiveStatus && upserted?.tenant_id) {
    const dk = `poll:${onlineOrderId}:${prevStatus ?? "null"}:${effectiveStatus}:${statusCode ?? "null"}`;
    await appendPollStatusEvent(admin, {
      tenantId: upserted.tenant_id,
      onlineOrderId,
      fromStatus: prevStatus,
      toStatus: effectiveStatus,
      platformEnum,
      numericCode: statusCode,
      payload: {
        source: "getir-api upsertGetirOrder",
        getirOrderId: platformOrderId,
        getirMappedStatus: normalizedStatus,
      },
      dedupeKey: dk,
    });
  }

  // Item replace (delete + insert) — siparis icerigi degisebiliyor mu? Getir spec: hayir,
  // ama yine de idempotent davranis icin sil-tekrar yaz.
  await admin.from("online_order_items").delete().eq("online_order_id", onlineOrderId);
  if (products.length) {
    const itemsRows = products.map((p: any) => ({
      tenant_id: platform.tenant_id,
      online_order_id: onlineOrderId,
      platform_product_name:
        extractLocalized(p.name || p.productName || p.menuItem?.name) || "Urun",
      platform_product_code: String(p.id || p._id || ""),
      quantity: Number(p.count || p.quantity || 1),
      unit_price: Number(p.price || 0),
      total_amount: Number((p.price || 0) * (p.count || p.quantity || 1)),
      notes: extractLocalized(p.note || p.specialInstructions) || null,
      toppings: Array.isArray(p.options) ? p.options : [],
    }));
    await admin.from("online_order_items").insert(itemsRows);
  }

  return { id: onlineOrderId, isNew, statusCode, normalizedStatus: effectiveStatus };
}

/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 1) Auth: caller'in JWT'sini al
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ ok: false, error: "Authorization gerekli" }, 401);
  }
  const accessToken = authHeader.slice("bearer ".length).trim();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Supabase yeni API key sistemi (sb_publishable_*) ile SUPABASE_ANON_KEY env
  // her zaman set olur. Bazı eski projelerde fallback olarak service-role var.
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") || supabaseService;
  const admin = createClient(supabaseUrl, supabaseService);

  // 2) JWT'yi resmi "user client" pattern'i ile dogrula (anon key + Authorization header).
  //    Eski yöntem `admin.auth.getUser(token)` bazı `sb_publishable_*` / yeni
  //    API-key konfigürasyonlarında "Gecersiz oturum" üretiyordu.
  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let { data: userInfo, error: userErr } = await userClient.auth.getUser();
  if ((userErr || !userInfo?.user) && supabaseService) {
    // Fallback: service-role + token. Bazı bölgelerde anon-key tabanlı
    // doğrulama 401 dönerse service-role direkt çalışıyor.
    const tryAdmin = await admin.auth.getUser(accessToken);
    if (!tryAdmin.error && tryAdmin.data?.user) {
      userInfo = tryAdmin.data as any;
      userErr = null as any;
    }
  }
  if (userErr || !userInfo?.user) {
    console.warn("[getir-api] auth fail:", {
      tokenLen: accessToken.length,
      hasAnon: !!Deno.env.get("SUPABASE_ANON_KEY"),
      hasService: !!supabaseService,
      msg: (userErr as any)?.message,
      status: (userErr as any)?.status,
    });
    return jsonResponse({
      ok: false,
      error: "Gecersiz oturum",
      reason: (userErr as any)?.message || "auth.getUser failed",
    }, 401);
  }
  const userId = userInfo.user.id;

  // is_super_admin destegi var: superadmin'ler herhangi bir tenant'in
  // platformunu yonetebilir. Aksi halde profile.tenant_id ile eslesmeli.
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("tenant_id, is_super_admin, role")
    .eq("id", userId)
    .maybeSingle();
  if (profErr || !profile) {
    return jsonResponse({ ok: false, error: "Profil bulunamadi" }, 403);
  }
  const callerTenantId: string | null = profile.tenant_id ?? null;
  const isSuperAdmin: boolean = !!(profile as any).is_super_admin || profile.role === 'super_admin' || profile.role === 'superadmin';

  // 3) Body parse
  let body: ActionRequest;
  try {
    body = await req.json();
  } catch {
    return badRequest("body JSON parse edilemedi");
  }
  if (!body?.platformId || !body?.action) {
    return badRequest("platformId ve action zorunlu");
  }

  console.log("[getir-api] request", {
    userId,
    callerTenantId,
    isSuperAdmin,
    platformId: body.platformId,
    action: body.action,
  });

  // 4) Platform row — once tenant filter yapmadan getir, sonra yetkilendir
  const { data: platform, error: pErr } = await admin
    .from("online_order_platforms")
    .select(
      "id,tenant_id,getir_environment,getir_app_secret_key,getir_restaurant_secret_key,getir_restaurant_id,getir_token,getir_token_expires_at,getir_pos_status,settings,api_key",
    )
    .eq("id", body.platformId)
    .maybeSingle();
  if (pErr || !platform) {
    console.error("[getir-api] platform query result", { pErr, platform, askedId: body.platformId });
    return jsonResponse({
      ok: false,
      error: `Platform bulunamadi (id=${body.platformId}, dbErr=${pErr?.message || 'null'})`,
    }, 404);
  }

  // 5) Yetkilendirme: superadmin -> her tenant; degilse profile.tenant_id == platform.tenant_id
  if (!isSuperAdmin && platform.tenant_id !== callerTenantId) {
    return jsonResponse({
      ok: false,
      error: `Bu platform sizin tenantiniza ait degil (caller=${callerTenantId || 'null'} platform=${platform.tenant_id})`,
    }, 403);
  }

  const creds = normalizeCredentials(platform as PlatformRow);
  const baseUrl = getirBaseUrl(creds.environment);

  try {
    switch (body.action) {
      // ---- POS STATUS (token gerekmez) -----------------------------------
      case "pos-status-get": {
        const resp = await fetch(`${baseUrl}/restaurants/pos-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appSecretKey: creds.appSecretKey,
            restaurantSecretKey: creds.restaurantSecretKey,
          }),
        });
        const raw = await resp.text();
        let data: any = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (resp.ok) {
          const posStatus = Number(data?.posStatus ?? data?.data?.posStatus ?? 200);
          await admin
            .from("online_order_platforms")
            .update({ getir_pos_status: posStatus })
            .eq("id", platform.id);
        }
        return jsonResponse({ ok: resp.ok, status: resp.status, data });
      }

      case "pos-status-set": {
        const target = body.status === 100 ? 100 : 200;
        const resp = await fetch(`${baseUrl}/restaurants/pos-status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            posStatus: target,
            appSecretKey: creds.appSecretKey,
            restaurantSecretKey: creds.restaurantSecretKey,
          }),
        });
        const raw = await resp.text();
        let data: any = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (resp.ok) {
          await admin
            .from("online_order_platforms")
            .update({ getir_pos_status: target, is_active: target === 100 })
            .eq("id", platform.id);
        }
        return jsonResponse({ ok: resp.ok, status: resp.status, data });
      }

      // ---- LOGIN (manual refresh) -----------------------------------------
      case "login": {
        const tr = await ensureToken(admin, platform as PlatformRow, true);
        if ("error" in tr) return jsonResponse({ ok: false, ...tr }, tr.status);
        return jsonResponse({ ok: true, expiresAt: new Date(Date.now() + 55 * 60_000).toISOString() });
      }

      // ---- POLL (sipariş çekme) -------------------------------------------
      /**
       * Getir Food API resmi endpoint'leri (developers.getir.com/food):
       *   POST /food-orders/active                — POS'a gönderilmiş aktif siparişler
       *   POST /food-orders/periodic/unapproved   — onay bekleyen yeni siparişler (325/350)
       *   POST /food-orders/periodic/cancelled    — iptal edilmiş siparişler (24 saat)
       * Hepsi POST, body yok; auth `token` header.
       */
      case "poll-active":
      case "poll-unapproved":
      case "poll-cancelled": {
        const path =
          body.action === "poll-active"
            ? "/food-orders/active"
            : body.action === "poll-unapproved"
              ? "/food-orders/periodic/unapproved"
              : "/food-orders/periodic/cancelled";
        const res = await callGetir(admin, platform as PlatformRow, "POST", path, body.payload);
        if (!res.ok) return jsonResponse({ ok: false, status: res.status, data: res.data }, res.status);
        const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.orders || []);
        let saved = 0;
        let newCount = 0;
        for (const ord of list) {
          const result = await upsertGetirOrder(admin, platform as PlatformRow, ord);
          if (result) {
            saved++;
            if (result.isNew) newCount++;
          }
        }
        // Otomatik reconcile: poll-active Getir'in TÜM aktif siparişlerini
        // döndürür. DB'de "aktif" görünüp Getir listesinde olmayan ve 30+
        // dakikadır güncellenmemiş kayıtları sessizce kapanmış say (Getir
        // panelinde teslim/iptal olmuş). Test ortamında bunlar birikip
        // "Mutfakta" sekmesini şişiriyordu; her handover denemesinde
        // "invalid status" hatasına yol açıyordu.
        let reconciled = 0;
        if (body.action === "poll-active") {
          const liveIds = new Set(list.map((o: any) => String(o.id || o._id || "")));
          const cutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { data: stale } = await admin
            .from("online_orders")
            .select("id, platform_order_id, status")
            .eq("tenant_id", platform.tenant_id)
            .eq("platform_id", platform.id)
            .in("status", [
              "verified",
              "accepted",
              "preparing",
              "ready",
              "handed_over",
              "on_the_way",
              "arrived",
              "scheduled_accepted",
            ])
            .lt("updated_at", cutoffIso);
          if (Array.isArray(stale) && stale.length > 0) {
            const toClose = stale.filter((row: any) => !liveIds.has(String(row.platform_order_id)));
            if (toClose.length > 0) {
              const ids = toClose.map((r: any) => r.id);
              const { error: rcErr } = await admin
                .from("online_orders")
                .update({
                  status: "delivered",
                  delivered_at: new Date().toISOString(),
                  getir_cancel_note: "auto-reconcile: Getir aktif listesinde yok",
                })
                .in("id", ids);
              if (!rcErr) reconciled = toClose.length;
              else console.warn("[getir-api] reconcile update hata:", rcErr.message);
            }
          }
        }
        return jsonResponse({ ok: true, fetched: list.length, saved, newCount, reconciled });
      }

      // ---- INQUIRY: tek sipariş için Getir'den güncel veri çek ----------
      // Getir Food API'sinin sipariş sorgulama endpoint'i: GET /food-orders/{orderId}
      // Aksiyon hatası (status invalid vb.) alındığında frontend bunu çağırarak
      // DB'yi gerçek status ile senkron eder.
      case "inquiry": {
        if (!body.orderId) return badRequest("orderId zorunlu");
        const path = `/food-orders/${encodeURIComponent(body.orderId)}`;
        const res = await callGetir(admin, platform as PlatformRow, "GET", path);
        if (!res.ok) {
          return jsonResponse({ ok: false, status: res.status, data: res.data }, res.status);
        }
        const ord = res.data?.data || res.data;
        if (!ord || typeof ord !== "object") {
          return jsonResponse({ ok: false, error: "Getir'den boş yanıt geldi" }, 502);
        }
        const result = await upsertGetirOrder(admin, platform as PlatformRow, ord);
        return jsonResponse({
          ok: true,
          synced: !!result,
          getirStatusCode: result?.statusCode ?? ord?.status,
          normalizedStatus: result?.normalizedStatus ?? null,
        });
      }

      // ---- ORDER ACTIONS --------------------------------------------------
      case "verify":
      case "verify-scheduled":
      case "prepare":
      case "handover":
      case "deliver": {
        if (!body.orderId) return badRequest("orderId zorunlu");

        // Tek-istek orkestratör: aksiyon "invalid status" alırsa server tarafında
        // inquiry yap → already-done / cancelled / 1 adım geride senaryolarını
        // otomatik kurtar. Frontend tek istek atar, 429 baskısı oluşmaz, ŞefPOS
        // Getir paneliyle senkron kalır.
        const result = await tryGetirActionWithRecovery(
          admin,
          platform as PlatformRow,
          body.action,
          body.orderId,
          body.payload,
        );

        if (result.ok) {
          // Başarı (orijinal veya kurtarılmış) — DB'yi güncelle ve lifecycle
          // timestamp'leri ekle.
          const embedded = extractOrderFromGetirActionResponse(result.data);
          if (embedded) {
            await upsertGetirOrder(admin, platform as PlatformRow, embedded, { skipAckClamp: true });
          }

          // Lifecycle timestamps — her zaman set et (Getir state'i atlamış olsa bile
          // kasada doğru zaman damgası kalsın). `is(..., null)` ile yalnızca ilk kez.
          const nowIso = new Date().toISOString();
          if (body.action === "verify" || body.action === "verify-scheduled") {
            await admin
              .from("online_orders")
              .update({ accepted_at: nowIso })
              .eq("platform_id", platform.id)
              .eq("platform_order_id", body.orderId)
              .is("accepted_at", null);
          }
          if (body.action === "handover") {
            await admin
              .from("online_orders")
              .update({ ready_at: nowIso })
              .eq("platform_id", platform.id)
              .eq("platform_order_id", body.orderId)
              .is("ready_at", null);
          }
          if (body.action === "deliver") {
            await admin
              .from("online_orders")
              .update({ delivered_at: nowIso })
              .eq("platform_id", platform.id)
              .eq("platform_order_id", body.orderId)
              .is("delivered_at", null);
          }

          // ---- Action status CAP --------------------------------------------------
          // Sorun: Getir test ortamı bazen verify/prepare sonrası embedded order'da
          // ileri bir status döndürüyor (örn. verify yapıldı, embedded.status=500/READY).
          // upsertGetirOrder bunu olduğu gibi DB'ye yazınca ŞefPOS "HAZIR" badge'i
          // gösteriyor, oysa Getir paneli hâlâ "Hazırlanıyor" (410). Kullanıcı kafası
          // karışıyor + olmayan "KURYE YOLA ÇIKTI" butonuna basıp 400 alıyor.
          //
          // Çözüm: Aksiyonun mantıksal hedefinin üzerine çıkmasını engelle. Getir'in
          // gerçek durumu zaten 15s polling'de yansıtılır; o zamana kadar UI tutarlı kalır.
          //
          // CAP kuralları:
          //   verify           → status<='verified'  (code<=400)
          //   verify-scheduled → status<='scheduled_accepted' (code<=350)
          //   prepare          → status<='preparing' (code<=410)
          //   handover/deliver → CAP yok (Getir kurye akışında 550/700 gerçek olabilir)
          const ACTION_CAP: Record<string, { status: string; code: number }> = {
            verify: { status: "verified", code: 400 },
            "verify-scheduled": { status: "scheduled_accepted", code: 350 },
            prepare: { status: "preparing", code: 410 },
          };
          const cap = ACTION_CAP[body.action];
          if (cap) {
            // Sadece DB'deki getir_status_code, cap'in ÜSTÜNDE ise geri çek (cap'le).
            // Aksi halde (cap'in altındaysa) Getir'in gerçek polling değeri korunur.
            await admin
              .from("online_orders")
              .update({ status: cap.status, getir_status_code: cap.code })
              .eq("platform_id", platform.id)
              .eq("platform_order_id", body.orderId)
              .gt("getir_status_code", cap.code);
          }

          // Embedded yoksa sabit tahminci patch (yedek)
          if (!embedded && !(result.meta?.alreadyDone || result.meta?.cancelled)) {
            const nextStatus: Record<
              string,
              { status: string; statusCode: number }
            > = {
              verify: { status: "verified", statusCode: 400 },
              "verify-scheduled": { status: "scheduled_accepted", statusCode: 350 },
              prepare: { status: "preparing", statusCode: 410 },
              handover: { status: "handed_over", statusCode: 550 },
              deliver: { status: "delivered", statusCode: 800 },
            };
            const upd = nextStatus[body.action];
            if (upd) {
              await admin
                .from("online_orders")
                .update({ status: upd.status, getir_status_code: upd.statusCode })
                .eq("platform_id", platform.id)
                .eq("platform_order_id", body.orderId);
            }
          }

          return jsonResponse({
            ok: true,
            status: 200,
            data: result.data,
            meta: result.meta,
          });
        }

        // verify özel fallback: Getir 400+ iken verify reddeder; yine de kasa
        // onayını tamamla (test ortamında bazen sipariş zaten otomatik onaylanmış).
        if (body.action === "verify" || body.action === "verify-scheduled") {
          const inq = await callGetir(
            admin,
            platform as PlatformRow,
            "GET",
            `/food-orders/${encodeURIComponent(body.orderId)}`,
          );
          if (inq.ok) {
            const ord = inq.data?.data || inq.data;
            if (ord && typeof ord === "object") {
              const rawSt = (ord as any).status;
              const c = typeof rawSt === "number" ? rawSt : Number(rawSt);
              if (Number.isFinite(c) && c >= 400 && c < 1500) {
                const nowIso = new Date().toISOString();
                const st = body.action === "verify-scheduled" ? "scheduled_accepted" : "verified";
                await admin
                  .from("online_orders")
                  .update({ accepted_at: nowIso, status: st, getir_status_code: c })
                  .eq("platform_id", platform.id)
                  .eq("platform_order_id", body.orderId);
                await upsertGetirOrder(admin, platform as PlatformRow, ord, { skipAckClamp: true });
                return jsonResponse({ ok: true, status: 200, data: ord, meta: { verifyFallback: true } });
              }
            }
          }
        }

        return jsonResponse({
          ok: false,
          status: result.status,
          data: result.data,
          meta: result.meta,
        }, result.status);
      }

      case "cancel": {
        if (!body.orderId) return badRequest("orderId zorunlu");
        const path = `/food-orders/${encodeURIComponent(body.orderId)}/cancel`;
        const payload: Record<string, any> = {
          cancelReasonId: body.cancelReasonId || "",
          cancelNote: body.cancelNote || "",
        };
        if (body.productId) payload.productId = body.productId;
        const res = await callGetir(admin, platform as PlatformRow, "POST", path, payload);
        if (res.ok) {
          await admin
            .from("online_orders")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              getir_cancel_reason_id: body.cancelReasonId || null,
              getir_cancel_note: body.cancelNote || null,
            })
            .eq("platform_id", platform.id)
            .eq("platform_order_id", body.orderId);
        }
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }

      // ---- RESTAURANT STATUS / BUSY --------------------------------------
      case "restaurant-status-open": {
        const res = await callGetir(admin, platform as PlatformRow, "PUT", "/restaurants/status/open");
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }
      case "restaurant-status-close": {
        const tof = body.timeOffAmount === 30 ? 30 : body.timeOffAmount === 45 ? 45 : 15;
        const res = await callGetir(admin, platform as PlatformRow, "PUT", "/restaurants/status/close", { timeOffAmount: tof });
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }
      case "restaurant-busy": {
        const payload: Record<string, any> = { isBusy: !!body.isBusy };
        if (body.isBusy && body.busynessDifferenceDuration) {
          payload.busynessDifferenceDuration = body.busynessDifferenceDuration;
        }
        const res = await callGetir(admin, platform as PlatformRow, "PUT", "/restaurants/delivery-duration/busyness", payload);
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }

      // ---- PRODUCT STATUS -------------------------------------------------
      case "product-status-set": {
        if (!body.productId && !body.chainProductId) return badRequest("productId veya chainProductId zorunlu");
        const path = body.chainProductId
          ? `/products/chain-id/${encodeURIComponent(body.chainProductId)}/status`
          : `/products/${encodeURIComponent(body.productId!)}/status`;
        const res = await callGetir(admin, platform as PlatformRow, "PUT", path, {
          status: body.status === 100 ? 100 : 200,
        });
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }

      case "option-product-set": {
        if (!body.optionProductId) return badRequest("optionProductId zorunlu");
        const active = body.status === 100;
        const verb = active ? "activate-as-option" : "inactivate-as-option";
        const path = `/products/option-products/${encodeURIComponent(body.optionProductId)}/${verb}`;
        const res = await callGetir(admin, platform as PlatformRow, "POST", path);
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }

      // ---- MENU -----------------------------------------------------------
      case "menu-get": {
        const res = await callGetir(admin, platform as PlatformRow, "GET", "/restaurants/menu");
        return jsonResponse({ ok: res.ok, status: res.status, data: res.data });
      }

      default:
        return badRequest(`bilinmeyen action: ${body.action}`);
    }
  } catch (err: any) {
    console.error("[getir-api] crash:", err);
    return serverError(err?.message || "unknown", { stack: err?.stack });
  }
});
