import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchYemeksepetiOrders(credentials: any) {
  const { username, password, api_key } = credentials;

  try {
    const response = await fetch('https://restaurant-api.yemeksepeti.com/v1/orders', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
        'X-Restaurant-ID': username,
      },
    });

    if (!response.ok) {
      throw new Error(`Yemeksepeti API error: ${response.status}`);
    }

    const data = await response.json();
    return data.orders || [];
  } catch (error: any) {
    console.error('Yemeksepeti fetch error:', error);
    return [];
  }
}

async function fetchGetirOrders(credentials: any) {
  const { username, password, api_key } = credentials;

  try {
    const response = await fetch('https://restaurant-api.getir.com/v1/orders', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
        'X-Restaurant-ID': username,
      },
    });

    if (!response.ok) {
      throw new Error(`Getir API error: ${response.status}`);
    }

    const data = await response.json();
    return data.orders || [];
  } catch (error: any) {
    console.error('Getir fetch error:', error);
    return [];
  }
}

async function fetchTrendyolOrders(credentials: any) {
  const { username, password, api_key } = credentials;

  try {
    const response = await fetch('https://api.trendyolyemek.com/v1/orders', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
        'X-Supplier-ID': username,
      },
    });

    if (!response.ok) {
      throw new Error(`Trendyol API error: ${response.status}`);
    }

    const data = await response.json();
    return data.orders || [];
  } catch (error: any) {
    console.error('Trendyol fetch error:', error);
    return [];
  }
}

async function processOrders(supabase: any, tenantId: string, platformId: string, platformCode: string, platformCommissionRate: number, orders: any[]) {
  let newOrdersCount = 0;

  for (const order of orders) {
    const { data: existing } = await supabase
      .from('online_orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('platform_id', platformId)
      .eq('platform_order_id', order.id || order.orderId)
      .maybeSingle();

    if (existing) {
      continue;
    }

    const totalAmount = order.totalAmount || order.total || 0;
    const platformCommission = (totalAmount * platformCommissionRate) / 100;

    const { data: newOrder, error: orderError } = await supabase
      .from('online_orders')
      .insert({
        tenant_id: tenantId,
        platform_id: platformId,
        platform_order_id: order.id || order.orderId,
        platform_order_number: order.orderNumber || order.number,
        status: 'new',
        payment_status: 'paid',
        customer_name: order.customer?.name || order.customerName || 'N/A',
        customer_phone: order.customer?.phone || order.customerPhone,
        customer_address: order.deliveryAddress?.fullAddress || order.address,
        customer_notes: order.notes || order.customerNotes,
        subtotal: order.subtotal || order.itemsTotal || 0,
        delivery_fee: order.deliveryFee || 0,
        platform_commission: platformCommission,
        tax_amount: order.taxAmount || 0,
        discount_amount: order.discountAmount || 0,
        total_amount: totalAmount,
        estimated_delivery_time: order.estimatedDeliveryTime || order.deliveryTime,
        platform_created_at: order.createdAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      continue;
    }

    const items = order.items || order.orderItems || [];
    const orderItems = items.map((item: any) => ({
      tenant_id: tenantId,
      online_order_id: newOrder.id,
      platform_product_name: item.name || item.productName,
      platform_product_code: item.code || item.productCode,
      quantity: item.quantity || 1,
      unit_price: item.price || item.unitPrice || 0,
      tax_rate: item.taxRate || 0,
      discount_amount: item.discountAmount || 0,
      total_amount: item.totalAmount || (item.price * item.quantity) || 0,
      notes: item.notes || item.specialInstructions,
    }));

    if (orderItems.length > 0) {
      await supabase
        .from('online_order_items')
        .insert(orderItems);
    }

    newOrdersCount++;
  }

  return newOrdersCount;
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.tenant_id) {
      throw new Error('Tenant not found');
    }

    const { data: platforms } = await supabase
      .from('online_order_platforms')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true);

    if (!platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active platforms configured',
          newOrders: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let totalNewOrders = 0;

    for (const platform of platforms) {
      let orders: any[] = [];

      switch (platform.platform_code) {
        case 'yemeksepeti':
          orders = await fetchYemeksepetiOrders(platform.settings);
          break;
        case 'getir':
          orders = await fetchGetirOrders(platform.settings);
          break;
        case 'trendyol':
          orders = await fetchTrendyolOrders(platform.settings);
          break;
        default:
          console.log(`Unknown platform: ${platform.platform_code}`);
          continue;
      }

      const newOrders = await processOrders(
        supabase,
        profile.tenant_id,
        platform.id,
        platform.platform_code,
        platform.commission_rate,
        orders
      );

      totalNewOrders += newOrders;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync completed`,
        newOrders: totalNewOrders,
        platformsChecked: platforms.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({
        error: 'Sync failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
