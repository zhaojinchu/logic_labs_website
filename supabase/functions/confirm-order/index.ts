import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY)
    return json({ error: "Supabase configuration missing" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return json({ error: "Missing bearer token" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user)
    return json({ error: "Invalid or expired token" }, 401);

  let body: { sessionId?: string; session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = body.sessionId ?? body.session_id;
  if (!sessionId)
    return json({ error: "Missing session_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
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
    return json({ error: orderError.message }, 500);

  if (!order)
    return json({ error: "Order not found" }, 404);

  if (order.user_id && order.user_id !== user.id)
    return json({ error: "Forbidden" }, 403);

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
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
