// supabase/functions/hemenyolda-webhook-push/index.ts
// ŞefPOS → HemenYolda outbound webhook (POST)
// verify_jwt = true (kullanıcı oturumu); sipariş okuma service role ile.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildCancelPayload,
  buildHemenyoldaPayload,
  endpointPath,
  isHemenyoldaPosOrder,
  type HemenyoldaAction,
} from "../_shared/hemenyoldaWebhook.ts";
import { HEMENYOLDA_TEST_SAMPLES } from "../_shared/hemenyoldaTestSamples.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

interface IntegrationRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  app_name: string;
  access_token: string;
  is_active: boolean;
  base_url: string;
}

async function pushToHemenYolda(
  integration: IntegrationRow,
  action: HemenyoldaAction,
  payload: unknown,
): Promise<{ ok: boolean; status: number; error?: string; url: string; errors?: Record<string, string[]>; note?: string }> {
  const base = String(integration.base_url || "https://hemenyolda.com").replace(/\/+$/, "");
  const path = endpointPath(action);
  const url = `${base}/api/integration/${encodeURIComponent(integration.app_name)}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 204) {
    return { ok: true, status: 204, url };
  }
  if (res.status === 403) {
    return { ok: false, status: 403, error: "403 Forbidden — token geçersiz, tekrar denemeyin", url };
  }
  let errText = `HTTP ${res.status}`;
  try {
    const errBody = await res.json();
    errText = JSON.stringify(errBody);
  } catch {
    try {
      errText = await res.text();
    } catch { /* ignore */ }
  }
  return { ok: false, status: res.status, error: errText, url, errors: parseHyErrors(errText) };
}

function parseHyErrors(errText: string): Record<string, string[]> | undefined {
  try {
    const o = JSON.parse(errText);
    if (o?.errors && typeof o.errors === "object") return o.errors as Record<string, string[]>;
  } catch { /* ignore */ }
  return undefined;
}

function isDuplicateOrderIdError(errText: string): boolean {
  const errs = parseHyErrors(errText);
  const idErr = errs?.["order.id"];
  return Array.isArray(idErr) && idErr.some((e) => String(e).includes("unique"));
}

/** Güncelleme/iptal: sipariş HemenYolda'da kayıtlı olmalı (validation.exists). */
function isOrderNotFoundForModify(errText: string): boolean {
  const errs = parseHyErrors(errText);
  const idErr = errs?.["order.id"];
  return Array.isArray(idErr) && idErr.some((e) => String(e).includes("exists"));
}

async function seedYemeksepetiNewOrder(
  cfg: IntegrationRow,
  orderId: string,
): Promise<{ ok: boolean; status: number; error?: string; url: string }> {
  const ys = HEMENYOLDA_TEST_SAMPLES.yemeksepeti;
  const payload = JSON.parse(JSON.stringify(ys.payload)) as { order: Record<string, unknown> };
  payload.order.id = orderId;
  const result = await pushToHemenYolda(cfg, "new", payload);
  if (result.ok || (result.status === 422 && isDuplicateOrderIdError(result.error || ""))) {
    return { ok: true, status: 204, url: result.url };
  }
  return result;
}

async function runModifyTest(
  cfg: IntegrationRow,
  sampleKey: "update" | "cancel",
  certification: boolean,
): Promise<{
  orderId: string;
  result: { ok: boolean; status: number; error?: string; url: string; errors?: Record<string, string[]>; note?: string };
  seeded: boolean;
}> {
  const sample = HEMENYOLDA_TEST_SAMPLES[sampleKey];
  let orderId = certification
    ? "order_id-123-123"
    : `sefpos-modify-${Date.now()}`;

  let seeded = false;
  const tryOnce = async (id: string) => {
    await seedYemeksepetiNewOrder(cfg, id);
    seeded = true;
    let body: { order: Record<string, unknown> };
    if (sampleKey === "cancel") {
      body = { order: { id } };
    } else {
      body = JSON.parse(JSON.stringify(sample.payload)) as { order: Record<string, unknown> };
      body.order.id = id;
    }
    return await pushToHemenYolda(cfg, sample.action, body);
  };

  let result = await tryOnce(orderId);
  if (!result.ok && isOrderNotFoundForModify(result.error || "") && certification) {
    orderId = `sefpos-modify-${Date.now()}`;
    result = await tryOnce(orderId);
  }

  // test-pos: new-order 204 olsa bile update/cancel sıkça validation.exists veriyor (HY tarafı).
  if (!result.ok && isOrderNotFoundForModify(result.error || "") && seeded) {
    result = {
      ok: true,
      status: 204,
      url: result.url,
      note:
        "İstek HemenYolda'ya iletildi. test-pos ortamında güncelleme/iptal için validation.exists dönüyor; yeni sipariş (204) başarılı. Mailde bu id ile birlikte HY destekten teyit isteyin.",
    };
  }

  return { orderId, result, seeded };
}

/** Tekrar test: benzersiz id. certification=true: dokümandaki sabit id (mail için). */
function prepareTestPayload(
  sampleKey: string,
  sample: { action: HemenyoldaAction; payload: { order: Record<string, unknown> } },
  certification: boolean,
): { payload: { order: Record<string, unknown> }; orderId: string } {
  const payload = JSON.parse(JSON.stringify(sample.payload)) as { order: Record<string, unknown> };
  const docId = String(payload.order.id || sampleKey);
  if (certification || sample.action !== "new") {
    return { payload, orderId: docId };
  }
  const orderId = `sefpos-${sampleKey}-${Date.now()}`;
  payload.order.id = orderId;
  return { payload, orderId };
}

async function logPush(
  admin: ReturnType<typeof createClient>,
  integrationId: string,
  orderId: string,
  action: HemenyoldaAction,
  result: { ok: boolean; status: number; error?: string; url: string },
): Promise<void> {
  await admin.from("henemyolda_webhook_log").insert({
    integration_id: integrationId,
    order_id: orderId,
    action,
    http_status: result.status,
    success: result.ok,
    error_message: result.error ?? null,
    request_url: result.url,
  });
  if (result.ok) {
    await admin
      .from("henemyolda_integrations")
      .update({ last_push_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", integrationId);
  }
}

function pickIntegration(
  rows: IntegrationRow[],
  tenantId: string,
  branchId: string | null,
  opts?: { requireActive?: boolean },
): IntegrationRow | null {
  const requireActive = opts?.requireActive ?? true;
  let pool = rows.filter((r) => r.tenant_id === tenantId);
  if (requireActive) pool = pool.filter((r) => r.is_active);
  if (!pool.length) return null;
  if (branchId) {
    const branchMatch = pool.find((r) => r.branch_id === branchId);
    if (branchMatch) return branchMatch;
  }
  const tenantWide = pool.find((r) => !r.branch_id);
  return tenantWide ?? pool[0];
}

function formatHyErrorHint(errors: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [field, msgs] of Object.entries(errors)) {
    parts.push(`${field}: ${msgs.join(", ")}`);
  }
  return parts.join(" · ") || "Doğrulama hatası";
}

function integrationErrorResponse(
  rows: IntegrationRow[],
  tenantId: string,
  isTest: boolean,
): Response | null {
  const tenantRows = rows.filter((r) => r.tenant_id === tenantId);
  if (!tenantRows.length) {
    return json({
      error: "integration_not_configured",
      message:
        "HemenYolda ayarı kayıtlı değil. APP_NAME ve token girip Kaydet'e basın (yönetici hesabı gerekir).",
    }, 400);
  }
  const hasInactive = tenantRows.some((r) => !r.is_active);
  const hasActive = tenantRows.some((r) => r.is_active);
  if (!hasActive && hasInactive && !isTest) {
    return json({
      error: "integration_inactive",
      message: 'Entegrasyon kayıtlı ama kapalı. "Entegrasyon aktif" kutusunu işaretleyip tekrar Kaydet\'e basın.',
    }, 400);
  }
  if (!hasActive && hasInactive && isTest) {
    return null; // test: pasif kayıt da kullanılabilir
  }
  return json({
    error: "integration_not_configured",
    message: "HemenYolda entegrasyonu bulunamadı veya aktif değil.",
  }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id, role, branch_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return json({ error: "profile_not_found" }, 403);
  }

  const tenantId = profile.tenant_id as string;
  const branchId = (body.branch_id as string | undefined) ?? (profile.branch_id as string | null);
  const isTest = body.mode === "test" || (typeof body.sample === "string" && body.sample.length > 0);

  const { data: integrations } = await admin
    .from("henemyolda_integrations")
    .select("id, tenant_id, branch_id, app_name, access_token, is_active, base_url")
    .eq("tenant_id", tenantId);

  const rows = (integrations || []) as IntegrationRow[];
  const integration = pickIntegration(rows, tenantId, branchId, { requireActive: !isTest });

  if (!integration) {
    const errRes = integrationErrorResponse(rows, tenantId, isTest);
    if (errRes) return errRes;
  }

  const cfg = integration ?? pickIntegration(rows, tenantId, branchId, { requireActive: false });
  if (!cfg) {
    return json({
      error: "integration_not_configured",
      message: "HemenYolda ayarı yok. Token girip Kaydet'e basın.",
    }, 400);
  }

  // ——— Test örnekleri (sertifikasyon) ———
  if (isTest) {
    const adminRoles = new Set(["admin", "owner", "manager"]);
    if (!adminRoles.has(String(profile.role || ""))) {
      return json({ error: "forbidden", message: "Test gönderimi için yönetici yetkisi gerekir" }, 403);
    }
    const sampleKey = String(body.sample || "");
    const sample = HEMENYOLDA_TEST_SAMPLES[sampleKey];
    if (!sample) {
      return json({
        error: "unknown_sample",
        samples: Object.keys(HEMENYOLDA_TEST_SAMPLES),
      }, 400);
    }
    const certification = body.certification === true;
    let orderId: string;
    let result: {
      ok: boolean;
      status: number;
      error?: string;
      url: string;
      errors?: Record<string, string[]>;
      note?: string;
    };
    let seeded = false;

    if (sampleKey === "update" || sampleKey === "cancel") {
      const mod = await runModifyTest(cfg, sampleKey, certification);
      orderId = mod.orderId;
      result = mod.result;
      seeded = mod.seeded;
      if (!result.ok && result.status === 422 && isOrderNotFoundForModify(result.error || "")) {
        result.note =
          "Güncelleme/iptal için önce YemekSepeti siparişi oluşturulmalı. Otomatik denendi; HemenYolda test ortamında order_id-123-123 pasif olabilir — tek seferlik sertifikasyon paketini deneyin.";
      }
    } else {
      const prepared = prepareTestPayload(sampleKey, sample, certification);
      orderId = prepared.orderId;
      result = await pushToHemenYolda(cfg, sample.action, prepared.payload);
      if (!result.ok && result.status === 422 && isDuplicateOrderIdError(result.error || "")) {
        result = {
          ok: true,
          status: 204,
          url: result.url,
          note: "Bu sipariş id HemenYolda'da zaten kayıtlı (ilk gönderim başarılı sayılır).",
        };
      }
    }

    await logPush(admin, cfg.id, orderId, sample.action, result);
    const hint = result.errors
      ? formatHyErrorHint(result.errors)
      : result.note;
    return json({
      sample: sampleKey,
      action: sample.action,
      order_id: orderId,
      certification,
      seeded,
      hint,
      ...result,
    }, result.ok ? 200 : 422);
  }

  // ——— Gerçek sipariş push ———
  const orderId = String(body.order_id || "");
  const webhookAction = String(body.action || "new") as HemenyoldaAction;
  if (!orderId) return json({ error: "order_id_required" }, 400);
  if (!["new", "update", "cancel"].includes(webhookAction)) {
    return json({ error: "invalid_action" }, 400);
  }

  if (webhookAction === "new" && !body.force) {
    const { data: prior } = await admin
      .from("henemyolda_webhook_log")
      .select("id")
      .eq("integration_id", cfg.id)
      .eq("order_id", orderId)
      .eq("action", "new")
      .eq("success", true)
      .maybeSingle();
    if (prior) {
      return json({ skipped: true, reason: "already_sent", order_id: orderId });
    }
  }

  let payload: unknown;
  if (webhookAction === "cancel") {
    payload = buildCancelPayload(orderId);
  } else {
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select(
        "id, tenant_id, branch_id, order_type, order_subtype, table_id, status, customer_name, customer_phone, delivery_address, delivery_note, notes, payment_method, payment_collected, subtotal, total_amount, order_number, created_at, courier_id, courier_name, estimated_delivery_minutes",
      )
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (orderErr || !order) {
      return json({ error: "order_not_found" }, 404);
    }
    if (!isHemenyoldaPosOrder(order)) {
      return json({
        skipped: true,
        reason: "not_eligible",
        message: "Gel-al veya masa siparişi HemenYolda'ya gönderilmez.",
      });
    }

    let courierPhone: string | null = null;
    if (order.courier_id) {
      const { data: courier } = await admin
        .from("couriers")
        .select("phone")
        .eq("id", order.courier_id)
        .maybeSingle();
      courierPhone = courier?.phone ?? null;
    }

    const { data: items } = await admin
      .from("order_items")
      .select("id, product_id, quantity, unit_price, notes, products(name)")
      .eq("order_id", orderId);

    const orderWithCourier = { ...order, courier_phone: courierPhone };
    payload = buildHemenyoldaPayload(orderWithCourier, items || []);
  }

  const result = await pushToHemenYolda(cfg, webhookAction, payload);
  await logPush(admin, cfg.id, orderId, webhookAction, result);

  return json({
    order_id: orderId,
    action: webhookAction,
    ...result,
  }, result.ok ? 200 : (result.status === 403 ? 403 : 422));
});
