/**
 * Online Sipariş — Fişi Tekrar Bas.
 *
 * Kasiyer ŞefPOS Online Siparişler ekranında bir sipariş için "Fişi Tekrar Bas"
 * dediğinde bu fonksiyon çağrılır. Sipariş tipine göre HTML yeniden üretilip
 * `print_jobs` kuyruğuna atılır; Electron Print Agent kuyruğu okuyup ilgili
 * yazıcıya gönderir.
 *
 * Desteklenen platform tipleri:
 *   - Yemeksepeti / Trendyol / Migros (DH ailesi) — `online_orders.dh_raw_payload`
 *     içindeki orijinal DH order JSON'u kullanır.
 *   - Getir Yemek — `online_orders` + `online_order_items` snapshot'ından
 *     DH-benzeri yapıya dönüştürülür.
 *   - Generic (`online_order_webhook`) — minimum müşteri + ürün listesi ile basılır.
 *
 * İstek:
 *   POST /functions/v1/online-order-reprint
 *   Authorization: Bearer <user-jwt>
 *   Body: { onlineOrderId: string }
 *
 * Cevap:
 *   200 { ok: true, jobId: string }
 *   404 { ok: false, error: "Order not found" }
 *   401 { ok: false, error: "Unauthorized" }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildGetirReceiptInput,
  renderDHOrderReceiptHtml,
  type DHReceiptOrderInput,
} from "../_shared/dhOrderReceipt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface OnlineOrderRow {
  id: string;
  tenant_id: string;
  platform_id: string | null;
  platform_order_id: string | null;
  platform_order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_notes: string | null;
  expedition_type: string | null;
  payment_status: string | null;
  payment_type: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  total_amount: number;
  created_at: string;
  platform_created_at: string | null;
  estimated_delivery_time: string | null;
  rider_pickup_time: string | null;
  dh_raw_payload: any;
  getir_verification_code: string | null;
  getir_masked_phone: string | null;
  getir_courier_name: string | null;
  getir_courier_phone: string | null;
  getir_status_code: number | null;
  getir_delivery_type: number | null;
  getir_is_scheduled: boolean | null;
  getir_total_discount: number | null;
  getir_supplier_support_rate: number | null;
  getir_raw_payload: Record<string, unknown> | null;
}

interface PlatformRow {
  id: string;
  platform_code: string;
  platform_name: string;
}

interface OrderItemRow {
  platform_product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
  toppings: any;
}

function buildDHReceiptFromDB(
  platform: PlatformRow,
  order: OnlineOrderRow,
  items: OrderItemRow[],
): DHReceiptOrderInput {
  const raw = order.dh_raw_payload || {};
  return {
    platformLabel: platform.platform_name || platform.platform_code || "Online",
    orderCode: order.platform_order_number || raw.shortCode || order.platform_order_id || order.id.slice(0, 8),
    orderToken: raw.token || null,
    createdAt: order.platform_created_at || order.created_at,
    expeditionType: order.expedition_type || raw.expeditionType || "delivery",
    isPaid: (order.payment_status || raw?.payment?.status) === "paid",
    paymentType: order.payment_type || raw?.payment?.type || null,
    testOrder: !!raw.test,
    preOrder: !!raw.preOrder,
    customer: {
      firstName: raw?.customer?.firstName || null,
      lastName: raw?.customer?.lastName || null,
      fullName: order.customer_name || null,
      mobilePhone: order.customer_phone || raw?.customer?.mobilePhone || null,
      email: raw?.customer?.email || null,
    },
    delivery: raw.delivery
      ? {
          address: raw.delivery.address || null,
          expectedDeliveryTime: order.estimated_delivery_time || raw.delivery.expectedDeliveryTime || null,
          expressDelivery: !!raw.delivery.expressDelivery,
          riderPickupTime: order.rider_pickup_time || raw.delivery.riderPickupTime || null,
        }
      : order.customer_address
        ? {
            address: {
              street: order.customer_address,
            },
            expectedDeliveryTime: order.estimated_delivery_time,
            expressDelivery: false,
            riderPickupTime: order.rider_pickup_time,
          }
        : null,
    pickup: raw.pickup || null,
    customerComment: order.customer_notes || raw?.comments?.customerComment || null,
    vendorComment: raw?.comments?.vendorComment || null,
    products: (items || []).map((it) => ({
      name: it.platform_product_name || "Ürün",
      quantity: it.quantity,
      unitPrice: it.unit_price,
      paidPrice: it.total_amount,
      comment: it.notes,
      selectedToppings: Array.isArray(it.toppings)
        ? it.toppings.map((t: any) => ({
            name: t?.name || "",
            quantity: t?.quantity || 1,
            price: t?.price ?? null,
            children: Array.isArray(t?.children)
              ? t.children.map((c: any) => ({
                  name: c?.name || "",
                  quantity: c?.quantity || 1,
                }))
              : undefined,
          }))
        : undefined,
    })),
    totals: {
      grandTotal: Number(order.total_amount) || 0,
      subTotal: Number(order.subtotal) || undefined,
      vatTotal: Number(order.tax_amount) || undefined,
      deliveryFee: Number(order.delivery_fee) || undefined,
      discountTotal: Number(order.discount_amount) || undefined,
    },
  };
}

function buildGetirReceiptFromDB(
  _platform: PlatformRow,
  order: OnlineOrderRow,
  items: OrderItemRow[],
): DHReceiptOrderInput {
  return buildGetirReceiptInput(order, items);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST required" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: "Unauthorized", reason: userErr?.message }, 401);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    const onlineOrderId = String(body?.onlineOrderId || "").trim();
    if (!onlineOrderId) {
      return jsonResponse({ ok: false, error: "onlineOrderId required" }, 400);
    }

    // Profilden tenant_id'yi al — RLS yerine tenant doğrulaması için.
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.tenant_id) {
      return jsonResponse({ ok: false, error: "No tenant" }, 403);
    }

    const { data: order } = await admin
      .from("online_orders")
      .select(`
        id, tenant_id, platform_id, platform_order_id, platform_order_number,
        customer_name, customer_phone, customer_address, customer_notes,
        expedition_type, payment_status, payment_type,
        subtotal, delivery_fee, tax_amount, discount_amount, total_amount,
        created_at, platform_created_at, estimated_delivery_time, rider_pickup_time,
        dh_raw_payload, getir_verification_code, getir_masked_phone,
        getir_courier_name, getir_courier_phone, getir_status_code,
        getir_delivery_type, getir_is_scheduled, getir_total_discount, getir_supplier_support_rate,
        getir_raw_payload
      `)
      .eq("id", onlineOrderId)
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();

    if (!order) {
      return jsonResponse({ ok: false, error: "Order not found" }, 404);
    }

    let platform: PlatformRow | null = null;
    if (order.platform_id) {
      const { data: p } = await admin
        .from("online_order_platforms")
        .select("id, platform_code, platform_name")
        .eq("id", order.platform_id)
        .maybeSingle();
      platform = p || null;
    }

    const { data: items } = await admin
      .from("online_order_items")
      .select("platform_product_name, quantity, unit_price, total_amount, notes, toppings")
      .eq("online_order_id", onlineOrderId);

    const pf = platform || { id: "", platform_code: "online", platform_name: "Online" };
    const itemRows = (items || []) as OrderItemRow[];

    const isGetir = pf.platform_code === "getir";
    const receiptInput = isGetir
      ? buildGetirReceiptFromDB(pf as PlatformRow, order as OnlineOrderRow, itemRows)
      : buildDHReceiptFromDB(pf as PlatformRow, order as OnlineOrderRow, itemRows);

    const html = renderDHOrderReceiptHtml(receiptInput);
    const directPrint = body?.directPrint === true;

    if (directPrint) {
      return jsonResponse({ ok: true, html, platform: pf.platform_code });
    }

    const { data: job, error: jobError } = await admin
      .from("print_jobs")
      .insert({
        tenant_id: profile.tenant_id,
        html,
        printer_name: "",
        status: "pending",
      })
      .select("id")
      .single();

    if (jobError) {
      console.error("[online-order-reprint] print_jobs insert error:", jobError);
      return jsonResponse({ ok: false, error: "queue failed", details: jobError.message }, 500);
    }

    return jsonResponse({ ok: true, jobId: job.id, html, platform: pf.platform_code });
  } catch (err: any) {
    console.error("[online-order-reprint] error:", err);
    return jsonResponse({ ok: false, error: "internal", details: String(err?.message || err) }, 500);
  }
});
