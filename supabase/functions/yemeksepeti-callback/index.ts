import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type DHCallbackAction = "accept" | "reject" | "prepared" | "picked_up";

interface CallbackRequest {
  orderId: string;
  action: DHCallbackAction;
  rejectReason?: string;
  rejectMessage?: string;
  acceptanceTime?: string;
}

interface MiddlewarePlatform {
  id: string;
  tenant_id: string;
  middleware_url?: string | null;
  middleware_username?: string | null;
  middleware_password?: string | null;
  middleware_token?: string | null;
  middleware_token_expires_at?: string | null;
  webhook_secret?: string | null;
}

async function getMiddlewareToken(
  supabase: ReturnType<typeof createClient>,
  platform: MiddlewarePlatform
): Promise<string | null> {
  if (!platform.middleware_url || !platform.middleware_username || !platform.middleware_password) {
    return null;
  }

  const now = new Date();
  if (
    platform.middleware_token &&
    platform.middleware_token_expires_at &&
    new Date(platform.middleware_token_expires_at) > now
  ) {
    return platform.middleware_token;
  }

  try {
    const loginRes = await fetch(`${platform.middleware_url}/v2/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: platform.middleware_username,
        password: platform.middleware_password,
        grant_type: "client_credentials",
      }),
    });

    if (!loginRes.ok) {
      console.error("Middleware login failed:", loginRes.status, await loginRes.text());
      return null;
    }

    const loginData = await loginRes.json();
    const token = loginData.access_token as string;
    const expiresIn = (loginData.expires_in as number) || 1800;
    const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

    await supabase
      .from("online_order_platforms")
      .update({
        middleware_token: token,
        middleware_token_expires_at: expiresAt,
      })
      .eq("id", platform.id);

    return token;
  } catch (e: any) {
    console.error("Middleware login error:", e.message);
    return null;
  }
}

async function callMiddlewareApi(
  url: string,
  body: Record<string, unknown> | null,
  token: string
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const resBody = await res.text();
    return { ok: res.ok, status: res.status, body: resBody };
  } catch (e: any) {
    return { ok: false, status: 0, body: e.message };
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { orderId, action, rejectReason, rejectMessage, acceptanceTime }: CallbackRequest =
      await req.json();

    if (!orderId || !action) {
      return new Response(
        JSON.stringify({ error: "orderId and action required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: order, error: orderError } = await supabase
      .from("online_orders")
      .select("*, online_order_platforms(*)")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const platform: MiddlewarePlatform = order.online_order_platforms;
    const orderToken = order.dh_order_token;
    const middlewareBaseUrl = platform?.middleware_url || null;
    const now = new Date().toISOString();

    let newStatus: string | null = null;
    let updateData: Record<string, unknown> = {};
    let middlewareResult: { ok: boolean; status: number; body: string } | null = null;
    let preparationCompletedResult: { ok: boolean; status: number; body: string } | null = null;

    if (action === "accept") {
      newStatus = "accepted";
      updateData = { status: "accepted", accepted_at: now };
    } else if (action === "reject") {
      newStatus = "cancelled";
      updateData = { status: "cancelled", cancelled_at: now };
    } else if (action === "prepared") {
      newStatus = "ready";
      updateData = { status: "ready", ready_at: now };
    } else if (action === "picked_up") {
      newStatus = "delivered";
      updateData = { status: "delivered", delivered_at: now };
    }

    const { error: updateError } = await supabase
      .from("online_orders")
      .update(updateData)
      .eq("id", orderId);

    if (updateError) throw updateError;

    if (middlewareBaseUrl && orderToken) {
      const token = await getMiddlewareToken(supabase, platform);

      if (token) {
        if (action === "accept") {
          const defaultAcceptanceTime = acceptanceTime || new Date(Date.now() + 20 * 60 * 1000).toISOString();
          const body: Record<string, unknown> = {
            status: "order_accepted",
            acceptanceTime: defaultAcceptanceTime,
            remoteOrderId: order.remote_order_id || order.id,
          };
          middlewareResult = await callMiddlewareApi(
            `${middlewareBaseUrl}/v2/order/status/${orderToken}`,
            body,
            token
          );

        } else if (action === "reject") {
          const body: Record<string, unknown> = {
            status: "order_rejected",
            reason: rejectReason || "TOO_BUSY",
            message: rejectMessage || "",
          };
          middlewareResult = await callMiddlewareApi(
            `${middlewareBaseUrl}/v2/order/status/${orderToken}`,
            body,
            token
          );

        } else if (action === "prepared") {
          middlewareResult = await callMiddlewareApi(
            `${middlewareBaseUrl}/v2/orders/${orderToken}/preparation-completed`,
            null,
            token
          );

        } else if (action === "picked_up") {
          const body: Record<string, unknown> = {
            status: "order_picked_up",
          };
          middlewareResult = await callMiddlewareApi(
            `${middlewareBaseUrl}/v2/order/status/${orderToken}`,
            body,
            token
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        newStatus,
        middlewareApiCalled: !!middlewareResult,
        middlewareResult,
        preparationCompletedResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Callback error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
