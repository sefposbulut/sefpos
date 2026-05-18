// supabase/functions/partner-orders-api/index.ts
//
// Kurumsal dış partner REST API — paket/teslimat siparişleri (pull).
// HemenYolda veya başka her firma aynı endpoint'i kullanır; firma başına API anahtarı.
//
// Auth: Authorization: Bearer <api_key>  veya  X-Api-Key: <api_key>
// verify_jwt = false

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  isPartnerPackageOrder,
  mapOrderToPartnerDto,
} from "../_shared/partnerOrder.ts";

const API_VERSION = "1.0.0";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Api-Key, X-Request-Id",
};

const DELIVERY_STATUSES = new Set([
  "pending",
  "preparing",
  "ready",
  "assigned",
  "on_the_way",
  "picked_up",
  "delivered",
  "failed",
  "cancelled",
]);

interface ClientRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  partner_name: string;
  partner_reference: string | null;
  api_key: string;
  is_active: boolean;
}

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function err(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: unknown,
): Response {
  return json(
    { error: { code, message, details: details ?? undefined }, request_id: requestId },
    status,
    { "X-Request-Id": requestId },
  );
}

function requestId(req: Request): string {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}

function extractApiKey(req: Request): string | null {
  const direct = req.headers.get("x-api-key") || req.headers.get("X-Api-Key");
  if (direct?.trim()) return direct.trim();
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function routePath(req: Request): string {
  const url = new URL(req.url);
  let p = url.pathname;
  const markers = ["/partner-orders-api", "/functions/v1/partner-orders-api"];
  for (const m of markers) {
    const i = p.indexOf(m);
    if (i >= 0) {
      p = p.slice(i + m.length);
      break;
    }
  }
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}

async function resolveClient(admin: any, apiKey: string): Promise<ClientRow | null> {
  const { data, error } = await admin
    .from("partner_api_clients")
    .select("id, tenant_id, branch_id, partner_name, partner_reference, api_key, is_active")
    .eq("api_key", apiKey)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("[partner-orders-api] client lookup:", error);
    return null;
  }
  return data as ClientRow | null;
}

const ORDER_SELECT = `
  id, tenant_id, branch_id, order_number, order_type, order_subtype,
  status, delivery_status, table_id,
  customer_name, customer_phone, delivery_address, delivery_note,
  payment_method, payment_collected, payment_status,
  subtotal, total_amount, estimated_delivery_minutes,
  courier_id, courier_name, assigned_at, picked_up_at, delivered_at,
  created_at,
  order_items(
    id, product_id, quantity, unit_price, subtotal, total_amount, tax_rate, notes,
    products(name, sku)
  ),
  branches(id, name)
`;

async function fetchAckMap(
  admin: any,
  clientId: string,
  orderIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (orderIds.length === 0) return map;
  const { data } = await admin
    .from("partner_api_order_acks")
    .select("order_id, acked_at")
    .eq("client_id", clientId)
    .in("order_id", orderIds);
  for (const row of data || []) {
    map.set(String(row.order_id), String(row.acked_at));
  }
  return map;
}

function applyBranchFilter(q: any, client: ClientRow) {
  if (client.branch_id) return q.eq("branch_id", client.branch_id);
  return q;
}

async function listOrders(
  admin: any,
  client: ClientRow,
  url: URL,
  requestId: string,
): Promise<Response> {
  const since = url.searchParams.get("since");
  const includeAcked = url.searchParams.get("include_acked") === "true";
  const statusFilter = url.searchParams.get("status");
  let limit = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let q = admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("tenant_id", client.tenant_id)
    .is("table_id", null)
    .in("order_type", ["delivery", "takeaway"])
    .order("created_at", { ascending: true })
    .limit(limit * 3);

  q = applyBranchFilter(q, client);

  if (since) {
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return err("INVALID_SINCE", "since geçerli ISO-8601 tarih olmalıdır.", 400, requestId);
    }
    q = q.gte("created_at", sinceDate.toISOString());
  } else {
    const hours = parseInt(url.searchParams.get("hours") || "24", 10);
    const safeHours = Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : 24;
    const from = new Date(Date.now() - safeHours * 3600 * 1000);
    q = q.gte("created_at", from.toISOString());
  }

  if (statusFilter === "active") {
    q = q.not("status", "in", "(completed,cancelled)");
  } else if (statusFilter === "open") {
    q = q.eq("status", "active");
  }

  const { data: rows, error } = await q;
  if (error) {
    console.error("[partner-orders-api] list orders:", error);
    return err("INTERNAL", "Sipariş listesi alınamadı.", 500, requestId);
  }

  const eligible = (rows || []).filter(isPartnerPackageOrder);
  const orderIds = eligible.map((o: any) => String(o.id));
  const ackMap = await fetchAckMap(admin, client.id, orderIds);

  let filtered = eligible;
  if (!includeAcked) {
    filtered = eligible.filter((o: any) => !ackMap.has(String(o.id)));
  }

  const orders = filtered.slice(0, limit).map((o: any) =>
    mapOrderToPartnerDto(o, client, ackMap.get(String(o.id)) ?? null)
  );

  let nextSince: string | null = null;
  if (orders.length > 0) {
    const last = orders[orders.length - 1];
    nextSince = last.created_at;
  }

  return json({
    api_version: API_VERSION,
    request_id: requestId,
    partner: client.partner_name,
    count: orders.length,
    orders,
    next_since: nextSince,
    polling_hint_seconds: 30,
  }, 200, { "X-Request-Id": requestId });
}

async function getOrder(
  admin: any,
  client: ClientRow,
  orderId: string,
  requestId: string,
): Promise<Response> {
  let q = admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("tenant_id", client.tenant_id)
    .eq("id", orderId);
  q = applyBranchFilter(q, client);

  const { data: order, error } = await q.maybeSingle();
  if (error) {
    console.error("[partner-orders-api] get order:", error);
    return err("INTERNAL", "Sipariş alınamadı.", 500, requestId);
  }
  if (!order || !isPartnerPackageOrder(order)) {
    return err("NOT_FOUND", "Sipariş bulunamadı veya paket kapsamı dışında.", 404, requestId);
  }

  const ackMap = await fetchAckMap(admin, client.id, [String(order.id)]);
  const dto = mapOrderToPartnerDto(order, client, ackMap.get(String(order.id)) ?? null);

  return json({
    api_version: API_VERSION,
    request_id: requestId,
    partner: client.partner_name,
    order: dto,
  }, 200, { "X-Request-Id": requestId });
}

async function ackOrder(
  admin: any,
  client: ClientRow,
  orderId: string,
  requestId: string,
): Promise<Response> {
  const { data: order } = await admin
    .from("orders")
    .select("id, tenant_id, branch_id, order_type, order_subtype, table_id")
    .eq("id", orderId)
    .eq("tenant_id", client.tenant_id)
    .maybeSingle();

  if (!order || !isPartnerPackageOrder(order)) {
    return err("NOT_FOUND", "Sipariş bulunamadı.", 404, requestId);
  }
  if (client.branch_id && order.branch_id !== client.branch_id) {
    return err("NOT_FOUND", "Sipariş bu şube kapsamında değil.", 404, requestId);
  }

  const { error } = await admin.from("partner_api_order_acks").upsert(
    {
      client_id: client.id,
      order_id: orderId,
      acked_at: new Date().toISOString(),
      ack_source: "api",
    },
    { onConflict: "client_id,order_id" },
  );
  if (error) {
    console.error("[partner-orders-api] ack:", error);
    return err("INTERNAL", "Onay kaydedilemedi.", 500, requestId);
  }

  return json({
    api_version: API_VERSION,
    request_id: requestId,
    ok: true,
    order_id: orderId,
    acked_at: new Date().toISOString(),
  }, 200, { "X-Request-Id": requestId });
}

async function patchDelivery(
  admin: any,
  client: ClientRow,
  orderId: string,
  body: any,
  requestId: string,
): Promise<Response> {
  const deliveryStatus = body?.delivery_status;
  if (!deliveryStatus || !DELIVERY_STATUSES.has(String(deliveryStatus))) {
    return err(
      "INVALID_BODY",
      "delivery_status geçerli bir değer olmalıdır.",
      400,
      requestId,
      { allowed: [...DELIVERY_STATUSES] },
    );
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, tenant_id, branch_id, order_type, order_subtype, table_id")
    .eq("id", orderId)
    .eq("tenant_id", client.tenant_id)
    .maybeSingle();

  if (!order || !isPartnerPackageOrder(order)) {
    return err("NOT_FOUND", "Sipariş bulunamadı.", 404, requestId);
  }
  if (client.branch_id && order.branch_id !== client.branch_id) {
    return err("NOT_FOUND", "Sipariş bu şube kapsamında değil.", 404, requestId);
  }

  const updates: Record<string, unknown> = { delivery_status: deliveryStatus };
  if (body.courier_name) updates.courier_name = String(body.courier_name);
  if (body.courier_id) updates.courier_id = String(body.courier_id);
  if (deliveryStatus === "delivered") {
    updates.delivered_at = new Date().toISOString();
    updates.status = "completed";
  }

  const { error } = await admin.from("orders").update(updates).eq("id", orderId);
  if (error) {
    console.error("[partner-orders-api] patch delivery:", error);
    return err("INTERNAL", "Durum güncellenemedi.", 500, requestId);
  }

  return json({
    api_version: API_VERSION,
    request_id: requestId,
    ok: true,
    order_id: orderId,
    delivery_status: deliveryStatus,
  }, 200, { "X-Request-Id": requestId });
}

Deno.serve(async (req: Request) => {
  const rid = requestId(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const path = routePath(req);
  const apiKey = extractApiKey(req);

  if (path === "/" && req.method === "GET") {
    return json({
      service: "sefpos-partner-orders-api",
      provider: "ŞefPOS / SEFPOS",
      api_version: API_VERSION,
      description:
        "POS paket ve teslimat siparişleri için kurumsal REST API. Her dış firma için ayrı API anahtarı.",
      documentation_path: "/docs/integrations/partner-orders-api.html",
      documentation_markdown: "/docs/integrations/partner-orders-api.md",
      openapi: "/docs/integrations/partner-orders-api.openapi.yaml",
      endpoints: [
        "GET /v1/orders",
        "GET /v1/orders/{id}",
        "POST /v1/orders/{id}/ack",
        "PATCH /v1/orders/{id}/delivery",
      ],
      auth: "Authorization: Bearer <api_key> veya X-Api-Key",
      scope: "POS delivery/takeaway orders only (not online platform orders)",
    }, 200, { "X-Request-Id": rid });
  }

  if (!apiKey) {
    return err("UNAUTHORIZED", "API anahtarı gerekli (Bearer veya X-Api-Key).", 401, rid);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const client = await resolveClient(admin, apiKey);
  if (!client) {
    return err("UNAUTHORIZED", "Geçersiz veya pasif API anahtarı.", 401, rid);
  }

  await admin
    .from("partner_api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", client.id);

  try {
    if (path === "/v1/orders" && req.method === "GET") {
      return await listOrders(admin, client, new URL(req.url), rid);
    }

    const getMatch = path.match(/^\/v1\/orders\/([0-9a-f-]{36})$/i);
    if (getMatch && req.method === "GET") {
      return await getOrder(admin, client, getMatch[1], rid);
    }

    const ackMatch = path.match(/^\/v1\/orders\/([0-9a-f-]{36})\/ack$/i);
    if (ackMatch && req.method === "POST") {
      return await ackOrder(admin, client, ackMatch[1], rid);
    }

    const patchMatch = path.match(/^\/v1\/orders\/([0-9a-f-]{36})\/delivery$/i);
    if (patchMatch && req.method === "PATCH") {
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }
      return await patchDelivery(admin, client, patchMatch[1], body, rid);
    }

    return err("NOT_FOUND", "Bilinmeyen yol veya HTTP metodu.", 404, rid, { path });
  } catch (e) {
    console.error("[partner-orders-api] unhandled:", e);
    return err("INTERNAL", "Beklenmeyen sunucu hatası.", 500, rid);
  }
});
