import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OnlineOrderWebhook {
  platform: string;
  platformOrderId: string;
  platformOrderNumber?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerNotes?: string;
  items: Array<{
    productName: string;
    productCode?: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    notes?: string;
  }>;
  subtotal: number;
  deliveryFee?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  estimatedDeliveryTime?: string;
  platformCreatedAt?: string;
  tenantId: string;
}

interface NormalizedOrderItem {
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  notes?: string;
}

interface NormalizedOrder {
  platform: string;
  platformOrderId: string;
  platformOrderNumber?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerNotes?: string;
  items: NormalizedOrderItem[];
  subtotal: number;
  deliveryFee: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  estimatedDeliveryTime?: string;
  platformCreatedAt?: string;
  tenantId?: string;
  remoteId?: string;
  rawPayload: Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGetirPayload(payload: Record<string, unknown>): NormalizedOrder | null {
  const order = (payload.order as Record<string, unknown> | undefined) || payload;
  const customer = (order.customer as Record<string, unknown> | undefined) || {};
  const delivery = (order.delivery as Record<string, unknown> | undefined) || {};
  const pricing = (order.pricing as Record<string, unknown> | undefined)
    || (order.price as Record<string, unknown> | undefined)
    || {};
  const address = (delivery.address as Record<string, unknown> | undefined) || {};

  const rawItems =
    (order.items as unknown[]) ||
    (order.products as unknown[]) ||
    (order.basketItems as unknown[]) ||
    [];

  const items: NormalizedOrderItem[] = rawItems
    .map((entry) => (entry || {}) as Record<string, unknown>)
    .map((item) => {
      const quantity = asNumber(item.quantity, 1);
      const unitPrice = asNumber(
        item.unitPrice ?? item.price ?? item.amount ?? item.totalPrice,
        0,
      );
      return {
        productName: String(item.name ?? item.productName ?? item.title ?? "Ürün"),
        productCode: String(item.code ?? item.productCode ?? item.sku ?? ""),
        quantity: quantity > 0 ? quantity : 1,
        unitPrice,
        taxRate: asNumber(item.taxRate ?? item.vatRate, 0),
        notes: String(item.note ?? item.notes ?? item.customerNote ?? ""),
      };
    });

  const platformOrderId = String(order.id ?? order.orderId ?? payload.id ?? payload.orderId ?? "");
  if (!platformOrderId) return null;

  const subtotal = asNumber(
    pricing.subtotal ?? pricing.subTotal ?? order.subtotal ?? order.itemsTotal,
    0,
  );
  const deliveryFee = asNumber(pricing.deliveryFee ?? order.deliveryFee, 0);
  const taxAmount = asNumber(pricing.tax ?? pricing.taxAmount ?? order.taxAmount, 0);
  const discountAmount = asNumber(
    pricing.discount ?? pricing.discountAmount ?? order.discountAmount,
    0,
  );
  const totalAmount = asNumber(
    pricing.total ?? pricing.totalAmount ?? order.total ?? order.totalAmount,
    0,
  );

  const fullAddress = String(
    address.fullAddress ??
      delivery.fullAddress ??
      order.customerAddress ??
      order.address ??
      "",
  );

  const customerName = String(
    customer.fullName ??
      customer.name ??
      order.customerName ??
      payload.customerName ??
      "Müşteri",
  );

  return {
    platform: "getir",
    platformOrderId,
    platformOrderNumber: String(order.number ?? order.orderNumber ?? platformOrderId),
    customerName,
    customerPhone: String(customer.phone ?? order.customerPhone ?? ""),
    customerAddress: fullAddress,
    customerNotes: String(order.note ?? order.notes ?? payload.customerNotes ?? ""),
    items,
    subtotal,
    deliveryFee,
    taxAmount,
    discountAmount,
    totalAmount,
    estimatedDeliveryTime: String(
      delivery.estimatedDeliveryTime ??
        order.estimatedDeliveryTime ??
        order.deliveryTime ??
        "",
    ),
    platformCreatedAt: String(order.createdAt ?? payload.createdAt ?? ""),
    tenantId: String(payload.tenantId ?? order.tenantId ?? ""),
    remoteId: String(
      payload.remoteId ??
        order.remoteId ??
        order.restaurantId ??
        payload.restaurantId ??
        "",
    ),
    rawPayload: payload,
  };
}

function normalizeGenericPayload(payload: OnlineOrderWebhook): NormalizedOrder {
  return {
    platform: payload.platform,
    platformOrderId: payload.platformOrderId,
    platformOrderNumber: payload.platformOrderNumber,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    customerAddress: payload.customerAddress,
    customerNotes: payload.customerNotes,
    items: payload.items,
    subtotal: payload.subtotal,
    deliveryFee: payload.deliveryFee || 0,
    taxAmount: payload.taxAmount || 0,
    discountAmount: payload.discountAmount || 0,
    totalAmount: payload.totalAmount,
    estimatedDeliveryTime: payload.estimatedDeliveryTime,
    platformCreatedAt: payload.platformCreatedAt,
    tenantId: payload.tenantId,
    rawPayload: payload as unknown as Record<string, unknown>,
  };
}

function looksLikeGetirPayload(payload: Record<string, unknown>): boolean {
  const platform = String(payload.platform ?? payload.source ?? "").toLowerCase();
  if (platform === "getir") return true;
  if ("restaurantId" in payload || "appSecretKey" in payload) return true;
  if ("order" in payload && typeof payload.order === "object") {
    const orderObj = payload.order as Record<string, unknown>;
    if ("restaurantId" in orderObj || "basketItems" in orderObj) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawPayload = await req.json();
    const payload = looksLikeGetirPayload(rawPayload as Record<string, unknown>)
      ? normalizeGetirPayload(rawPayload as Record<string, unknown>)
      : normalizeGenericPayload(rawPayload as OnlineOrderWebhook);

    if (!payload || !payload.platformOrderId) {
      return new Response(
        JSON.stringify({
          error: "Invalid payload",
          details: "Unable to normalize incoming order payload",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const platformCode = payload.platform.toLowerCase();

    let platformQuery = supabase
      .from("online_order_platforms")
      .select("*")
      .eq("platform_code", platformCode)
      .eq("is_active", true);

    if (payload.tenantId) {
      platformQuery = platformQuery.eq("tenant_id", payload.tenantId);
    } else if (payload.remoteId) {
      platformQuery = platformQuery.eq("remote_id", payload.remoteId);
    } else {
      return new Response(
        JSON.stringify({
          error: "tenantId or remoteId required",
          details: "Payload must include tenantId or remoteId for platform lookup",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: platformData, error: platformError } = await platformQuery.maybeSingle();

    if (platformError || !platformData) {
      return new Response(
        JSON.stringify({
          error: "Platform not found or not active",
          details: platformError?.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("x-api-key");
    const signatureHeader = req.headers.get("x-getir-signature");
    const settings = (platformData.settings || {}) as Record<string, unknown>;
    const webhookSecret = (platformData.webhook_secret || settings.webhook_secret) as string | null;
    const getirRestaurantSecret = settings.restaurant_secret_key as string | undefined;
    const getirAppSecret = settings.app_secret_key as string | undefined;
    const expectedSecrets = [webhookSecret, getirRestaurantSecret, getirAppSecret].filter(Boolean) as string[];

    if (expectedSecrets.length > 0) {
      const validAuth = expectedSecrets.some((secret) => {
        const expectedBearer = `Bearer ${secret}`;
        return authHeader === expectedBearer || apiKeyHeader === secret || signatureHeader === secret;
      });
      if (!validAuth) {
        return new Response(
          JSON.stringify({ error: "Unauthorized webhook request" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const tenantId = platformData.tenant_id as string;
    const platformCommission = (payload.totalAmount * platformData.commission_rate) / 100;

    const { data: existingOrder } = await supabase
      .from("online_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("platform_id", platformData.id)
      .eq("platform_order_id", payload.platformOrderId)
      .maybeSingle();

    if (existingOrder) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Order already exists",
          orderId: existingOrder.id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: onlineOrder, error: orderError } = await supabase
      .from("online_orders")
      .insert({
        tenant_id: tenantId,
        platform_id: platformData.id,
        platform_order_id: payload.platformOrderId,
        platform_order_number: payload.platformOrderNumber,
        status: "new",
        payment_status: "paid",
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone || null,
        customer_address: payload.customerAddress || null,
        customer_notes: payload.customerNotes || null,
        subtotal: payload.subtotal,
        delivery_fee: payload.deliveryFee,
        platform_commission: platformCommission,
        tax_amount: payload.taxAmount,
        discount_amount: payload.discountAmount,
        total_amount: payload.totalAmount,
        estimated_delivery_time: payload.estimatedDeliveryTime || null,
        dh_raw_payload: payload.rawPayload,
        platform_created_at: payload.platformCreatedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderItems = payload.items.map((item) => ({
      tenant_id: tenantId,
      online_order_id: onlineOrder.id,
      platform_product_name: item.productName,
      platform_product_code: item.productCode || null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      tax_rate: item.taxRate || 0,
      discount_amount: 0,
      total_amount: item.unitPrice * item.quantity,
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabase
      .from("online_order_items")
      .insert(orderItems);

    if (itemsError) {
      await supabase.from("online_orders").delete().eq("id", onlineOrder.id);
      throw itemsError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Order created successfully",
        orderId: onlineOrder.id,
        orderNumber: onlineOrder.platform_order_number,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process order",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
