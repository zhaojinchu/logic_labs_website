import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required environment variables for retrieve-session function");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  if (req.method !== "GET" && req.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY)
    return json({ error: "Server configuration error" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    return json({ error: "Missing bearer token" }, 401);

  const jwt = authHeader.replace("Bearer ", "");

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt);

  if (userErr || !user?.id)
    return json({ error: "Invalid or expired token" }, 401);

  let sessionId: string | null = null;

  if (req.method === "GET") {
    const url = new URL(req.url);
    sessionId = url.searchParams.get("session_id");
  } else {
    try {
      const body = await req.json();
      sessionId = body?.session_id ?? null;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  if (!sessionId)
    return json({ error: "Missing session_id" }, 400);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select(`
      id,
      total_amount,
      status,
      currency,
      created_at,
      receipt_url,
      shipping_address,
      customer_email,
      stripe_checkout_session_id,
      order_items (
        id,
        product_id,
        product_name,
        quantity,
        price,
        products ( name, image_url )
      )
    `)
    .eq("stripe_checkout_session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (orderError) {
    console.error("Failed to load order", orderError);
    return json({ error: "Failed to load order" }, 500);
  }

  if (!order)
    return json({ error: "Order not found" }, 404);

  const items = (order.order_items ?? []).map((item) => ({
    id: item.id,
    product_id: item.product_id,
    product_name: item.product_name ?? item.products?.name ?? "",
    quantity: item.quantity,
    price: Number(item.price),
    image_url: item.products?.image_url ?? null,
  }));

  const currency = order.currency ? order.currency.toUpperCase() : "USD";

  return json({
    order: {
      id: order.id,
      total_amount: Number(order.total_amount),
      status: order.status,
      currency,
      created_at: order.created_at,
      receipt_url: order.receipt_url,
      shipping_address: order.shipping_address,
      customer_email: order.customer_email,
      stripe_checkout_session_id: order.stripe_checkout_session_id,
      items,
    },
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
