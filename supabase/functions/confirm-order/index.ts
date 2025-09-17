import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });

  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405, corsHeaders);

  if (!SUPABASE_URL || !ANON_KEY)
    return json({ error: "Supabase configuration missing" }, 500, corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return json({ error: "Missing bearer token" }, 401, corsHeaders);

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token)
    return json({ error: "Invalid authorization header" }, 401, corsHeaders);

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);


  if (userError || !user)
    return json({ error: "Invalid or expired token" }, 401, corsHeaders);

  let body: { sessionId?: string; session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const sessionId = body.sessionId ?? body.session_id;
  if (!sessionId)
    return json({ error: "Missing session_id" }, 400, corsHeaders);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, detectSessionInUrl: false },
  });

  const { data: order, error: orderError } = await admin

    .from("orders")
    .select(`
      id,
      user_id,
      created_at,
      total_amount,
      status,
      receipt_url,
      shipping_address,
      customer_email,
      stripe_session_id,
      order_items (
        id,
        product_id,
        quantity,
        price,
        products (name, image_url)
      )
    `)
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (orderError)
    return json({ error: orderError.message }, 500, corsHeaders);

  if (!order)
    return json({ error: "Order not found" }, 404, corsHeaders);

  if (order.user_id && order.user_id !== user.id)
    return json({ error: "Forbidden" }, 403, corsHeaders);

  const items = (order.order_items ?? []).map((item) => ({
    id: item.id,
    product_id: item.product_id,
    quantity: item.quantity,
    price: item.price,
    product_name: item.products?.name ?? "",
    image_url: item.products?.image_url ?? null,
  }));

  return json({
    order: {
      id: order.id,
      created_at: order.created_at,
      total_amount: order.total_amount,
      status: order.status,
      receipt_url: order.receipt_url,
      shipping_address: order.shipping_address,
      customer_email: order.customer_email,
      items,
    },
  }, 200, corsHeaders);
});

const DEFAULT_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      requestedHeaders?.length ? requestedHeaders : DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };

  if (origin)
    headers.Vary = "Origin";

  return headers;
}

function json(body: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
