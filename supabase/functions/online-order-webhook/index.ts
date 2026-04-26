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

    const payload: OnlineOrderWebhook = await req.json();

    const {
      platform,
      platformOrderId,
      platformOrderNumber,
      customerName,
      customerPhone,
      customerAddress,
      customerNotes,
      items,
      subtotal,
      deliveryFee = 0,
      taxAmount = 0,
      discountAmount = 0,
      totalAmount,
      estimatedDeliveryTime,
      platformCreatedAt,
      tenantId,
    } = payload;

    const { data: platformData, error: platformError } = await supabase
      .from("online_order_platforms")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("platform_code", platform.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

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

    const platformCommission = (totalAmount * platformData.commission_rate) / 100;

    const { data: existingOrder } = await supabase
      .from("online_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("platform_id", platformData.id)
      .eq("platform_order_id", platformOrderId)
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
        platform_order_id: platformOrderId,
        platform_order_number: platformOrderNumber,
        status: "new",
        payment_status: "paid",
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_notes: customerNotes,
        subtotal,
        delivery_fee: deliveryFee,
        platform_commission: platformCommission,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        estimated_delivery_time: estimatedDeliveryTime,
        platform_created_at: platformCreatedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderItems = items.map((item) => ({
      tenant_id: tenantId,
      online_order_id: onlineOrder.id,
      platform_product_name: item.productName,
      platform_product_code: item.productCode,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      tax_rate: item.taxRate || 0,
      discount_amount: 0,
      total_amount: item.unitPrice * item.quantity,
      notes: item.notes,
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
