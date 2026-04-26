import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DHTopping {
  id: string;
  name: string;
  price: string;
  quantity: number;
  remoteCode?: string | null;
  sku?: string;
  type?: "PRODUCT" | "VARIANT" | "EXTRA";
  children?: DHTopping[];
  discounts?: Array<{ amount: string; name?: string; sponsorships?: Array<{ sponsor: string; amount: string }> }>;
}

interface DHProduct {
  id: string;
  name: string;
  paidPrice: string;
  unitPrice: string;
  quantity: string;
  remoteCode?: string | null;
  sku?: string;
  categoryName?: string | null;
  comment?: string | null;
  selectedToppings?: DHTopping[];
  discounts?: Array<{ amount: string; name?: string; sponsorships?: Array<{ sponsor: string; amount: string }> }>;
}

interface DHOrder {
  token: string;
  code: string;
  shortCode?: string;
  createdAt: string;
  expiryDate?: string;
  expeditionType: "pickup" | "delivery";
  test?: boolean;
  preOrder?: boolean;
  comments?: {
    customerComment?: string | null;
    vendorComment?: string;
  };
  customer: {
    firstName?: string | null;
    lastName?: string | null;
    mobilePhone?: string | null;
    email?: string;
    flags?: string[];
  };
  delivery?: {
    address?: {
      street?: string;
      number?: string;
      building?: string;
      floor?: string;
      flatNumber?: string;
      intercom?: string;
      city?: string;
      postcode?: string;
      deliveryArea?: string;
      deliveryMainArea?: string;
      deliveryInstructions?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
    expectedDeliveryTime?: string | null;
    expressDelivery?: boolean;
    riderPickupTime?: string | null;
  };
  pickup?: {
    pickupTime?: string | null;
    pickupCode?: string;
  } | null;
  payment: {
    type: string;
    status: "pending" | "paid";
    remoteCode?: string;
  };
  price: {
    grandTotal: string;
    subTotal?: string;
    totalNet?: string;
    vatTotal?: string;
    payRestaurant?: string;
    riderTip?: string | null;
    collectFromCustomer?: string;
    deliveryFees?: Array<{ name: string; value: number }>;
    discountAmountTotal?: string;
  };
  discounts?: Array<{
    name?: string;
    amount: string;
    type?: string;
    sponsorships?: Array<{ sponsor: string; amount: string }>;
  }>;
  products: DHProduct[];
  localInfo: {
    platform: string;
    platformKey: string;
    countryCode: string;
    currencySymbol: string;
  };
  platformRestaurant: {
    id: string;
  };
  callbackUrls?: {
    orderAcceptedUrl?: string;
    orderRejectedUrl?: string;
    orderProductModificationUrl?: string;
    orderPickedUpUrl?: string;
    orderPreparedUrl?: string;
    orderPreparationTimeAdjustmentUrl?: string;
  };
  preparationTimeAdjustments?: {
    maxPickUpTimestamp: string;
    minPickupTimestamp: string;
    preparationTimeChangeIntervalsInMinutes: number[];
  };
}

function buildCustomerName(customer: DHOrder["customer"]): string {
  const first = customer.firstName?.trim() || "";
  const last = customer.lastName?.trim() || "";
  const full = [first, last].filter(Boolean).join(" ");
  return full || "Müşteri";
}

function buildDeliveryAddress(delivery?: DHOrder["delivery"]): string {
  if (!delivery?.address) return "";
  const a = delivery.address;
  const parts = [
    a.street,
    a.number,
    a.building ? `Bina: ${a.building}` : null,
    a.floor ? `Kat: ${a.floor}` : null,
    a.flatNumber ? `Daire: ${a.flatNumber}` : null,
    a.deliveryArea,
    a.deliveryMainArea,
    a.city,
    a.postcode,
  ].filter(Boolean);
  const base = parts.join(", ");
  if (a.deliveryInstructions) return `${base} - ${a.deliveryInstructions}`;
  return base;
}

function calcDeliveryFee(price: DHOrder["price"]): number {
  if (!price.deliveryFees || price.deliveryFees.length === 0) return 0;
  return price.deliveryFees.reduce((sum, f) => sum + (f.value || 0), 0);
}

function calcDiscountAmount(price: DHOrder["price"], discounts?: DHOrder["discounts"]): number {
  if (price.discountAmountTotal) {
    const v = parseFloat(price.discountAmountTotal);
    if (!isNaN(v)) return v;
  }
  if (discounts && discounts.length > 0) {
    return discounts.reduce((sum, d) => sum + parseFloat(d.amount || "0"), 0);
  }
  return 0;
}

async function verifyDHJWT(authHeader: string | null, secret: string | null): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  if (!secret) return true;

  try {
    const token = authHeader.slice(7);
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["verify"]
    );

    const signedData = encoder.encode(`${parts[0]}.${parts[1]}`);
    const signatureBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, signedData);
    return valid;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const remoteId = url.pathname.split("/").pop();

    if (!remoteId || remoteId === "yemeksepeti-webhook") {
      return new Response(
        JSON.stringify({ error: "remoteId required in path: /yemeksepeti-webhook/{remoteId}" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: platformData, error: platformError } = await supabase
      .from("online_order_platforms")
      .select("*")
      .eq("remote_id", remoteId)
      .eq("is_active", true)
      .maybeSingle();

    if (platformError || !platformData) {
      return new Response(
        JSON.stringify({ error: "Platform not found for remoteId", remoteId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const isValid = await verifyDHJWT(authHeader, platformData.webhook_secret);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order: DHOrder = await req.json();

    const { data: existing } = await supabase
      .from("online_orders")
      .select("id, remote_order_id")
      .eq("tenant_id", platformData.tenant_id)
      .eq("platform_id", platformData.id)
      .eq("platform_order_id", order.code)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ remoteResponse: { remoteOrderId: existing.remote_order_id || existing.id } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerName = buildCustomerName(order.customer);
    const customerPhone = order.customer.mobilePhone || null;
    const customerAddress = order.expeditionType === "delivery"
      ? buildDeliveryAddress(order.delivery)
      : (order.pickup?.pickupCode ? `Gel-al - Kod: ${order.pickup.pickupCode}` : "Gel-al");

    const customerNotes = order.comments?.customerComment || null;

    const grandTotal = parseFloat(order.price.grandTotal) || 0;
    const subTotal = parseFloat(order.price.subTotal || order.price.totalNet || "0") || 0;
    const vatTotal = parseFloat(order.price.vatTotal || "0") || 0;
    const deliveryFee = calcDeliveryFee(order.price);
    const discountAmount = calcDiscountAmount(order.price, order.discounts);
    const platformCommission = (grandTotal * (platformData.commission_rate || 0)) / 100;

    const expeditionType = order.expeditionType;
    const riderPickupTime = order.delivery?.riderPickupTime || null;
    const estimatedDeliveryTime = order.delivery?.expectedDeliveryTime
      || order.pickup?.pickupTime
      || null;

    const lat = order.delivery?.address?.latitude || null;
    const lng = order.delivery?.address?.longitude || null;

    const { data: newOrder, error: orderError } = await supabase
      .from("online_orders")
      .insert({
        tenant_id: platformData.tenant_id,
        platform_id: platformData.id,
        platform_order_id: order.code,
        platform_order_number: order.shortCode || order.code,
        dh_order_token: order.token,
        dh_platform_restaurant_id: order.platformRestaurant?.id || null,
        status: "new",
        payment_status: order.payment.status,
        payment_type: order.payment.type,
        expedition_type: expeditionType,
        rider_pickup_time: riderPickupTime,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_notes: customerNotes,
        subtotal: subTotal,
        delivery_fee: deliveryFee,
        platform_commission: platformCommission,
        tax_amount: vatTotal,
        discount_amount: discountAmount,
        total_amount: grandTotal,
        estimated_delivery_time: estimatedDeliveryTime,
        delivery_address_lat: lat,
        delivery_address_lng: lng,
        callback_urls: order.callbackUrls || {},
        dh_raw_payload: order,
        platform_created_at: order.createdAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const remoteOrderId = newOrder.id;

    await supabase
      .from("online_orders")
      .update({ remote_order_id: remoteOrderId })
      .eq("id", newOrder.id);

    const orderItems = (order.products || []).map((product) => ({
      tenant_id: platformData.tenant_id,
      online_order_id: newOrder.id,
      platform_product_name: product.name,
      platform_product_code: product.remoteCode || product.sku || null,
      dh_product_id: product.id || null,
      remote_code: product.remoteCode || null,
      quantity: parseInt(product.quantity) || 1,
      unit_price: parseFloat(product.unitPrice) || 0,
      tax_rate: 0,
      discount_amount: product.discounts
        ? product.discounts.reduce((s, d) => s + parseFloat(d.amount || "0"), 0)
        : 0,
      total_amount: parseFloat(product.paidPrice) || 0,
      notes: product.comment || null,
      toppings: product.selectedToppings || [],
    }));

    if (orderItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("online_order_items")
        .insert(orderItems);

      if (itemsError) {
        await supabase.from("online_orders").delete().eq("id", newOrder.id);
        throw itemsError;
      }
    }

    return new Response(
      JSON.stringify({ remoteResponse: { remoteOrderId } }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Yemeksepeti webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
