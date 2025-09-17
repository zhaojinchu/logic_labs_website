import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type CartPayloadItem = {
  product_id: string;
  quantity: number;
};

type CartMetadataItem = {
  product_id: string;
  quantity: number;
  unit_amount_cents: number;
  stripe_price_id: string | null;
  cart_item_id: string;
  product_name: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !STRIPE_SECRET) {
  console.error("[create-payment] Missing required environment variables", {
    hasSupabaseUrl: Boolean(SUPABASE_URL),
    hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    hasAnon: Boolean(SUPABASE_ANON_KEY),
    hasStripeSecret: Boolean(STRIPE_SECRET),
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !STRIPE_SECRET) {
    console.error("[create-payment] Server configuration error: missing env vars");
    return json({ error: "Server configuration error", code: "CONFIG_MISSING" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    return json({ error: "Missing bearer token" }, 401);

  const jwt = authHeader.replace("Bearer ", "");

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt);

  if (userErr || !user?.id || !user.email)
    return json({ error: "Invalid or expired token" }, 401);

  let cartPayload: CartPayloadItem[] = [];
  try {
    const body = await req.json();
    cartPayload = body?.cartItems ?? [];
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(cartPayload) || cartPayload.length === 0)
    return json({ error: "Cart is empty" }, 400);

  if (cartPayload.some((item) => typeof item?.product_id !== "string" || typeof item?.quantity !== "number" || item.quantity <= 0))
    return json({ error: "Invalid cart payload" }, 400);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: cartItems, error: cartError } = await adminClient
    .from("cart_items")
    .select(`
      id,
      product_id,
      quantity,
      products (
        name,
        price,
        stripe_price_id
      )
    `)
    .eq("user_id", user.id);

  if (cartError) {
    console.error("[create-payment] Failed to load cart", cartError);
    return json({ error: "Failed to load cart", code: "CART_QUERY_FAILED" }, 500);
  }

  if (!cartItems || cartItems.length === 0) {
    console.warn("[create-payment] No items found in database cart", { userId: user.id });
    return json({ error: "No items in cart", code: "CART_EMPTY" }, 400);
  }

  const payloadProductIds = new Set(cartPayload.map((item) => item.product_id));
  const relevantCartItems = cartItems.filter((record) => payloadProductIds.has(record.product_id));

  if (!relevantCartItems.length) {
    console.warn("[create-payment] Cart payload does not match stored cart", {
      payloadIds: Array.from(payloadProductIds),
    });
    return json({ error: "Cart is out of sync", code: "CART_MISMATCH" }, 409);
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const cartMetadata: CartMetadataItem[] = [];
  let totalCents = 0;

  for (const record of relevantCartItems) {
    const product = record.products;
    if (!product)
      continue;

    const quantity = record.quantity;
    if (!quantity || quantity <= 0)
      continue;

    const unitAmountCents = Math.round(Number(product.price) * 100);

    if (product.stripe_price_id && product.stripe_price_id.startsWith("price_")) {
      lineItems.push({ price: product.stripe_price_id, quantity });
    } else {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: unitAmountCents,
          product_data: {
            name: product.name,
          },
        },
        quantity,
      });
    }

    totalCents += unitAmountCents * quantity;

    cartMetadata.push({
      product_id: record.product_id,
      quantity,
      unit_amount_cents: unitAmountCents,
      stripe_price_id: product.stripe_price_id ?? null,
      cart_item_id: record.id,
      product_name: product.name,
    });
  }

  if (!lineItems.length) {
    console.error("[create-payment] Computed line items were empty", {
      cartCount: relevantCartItems.length,
    });
    return json({ error: "Unable to create checkout session", code: "LINE_ITEMS_EMPTY" }, 400);
  }

  const cartMetadataJson = JSON.stringify(cartMetadata);
  if (cartMetadataJson.length > 500) {
    console.error("[create-payment] Cart metadata too large", {
      length: cartMetadataJson.length,
    });
    return json({ error: "Cart metadata too large", code: "METADATA_LIMIT" }, 400);
  }

  const origin = req.headers.get("origin") ?? SITE_URL;
  if (!origin) {
    console.error("[create-payment] Missing SITE_URL and request origin");
    return json({ error: "SITE_URL env var not set", code: "SITE_URL_MISSING" }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2023-10-16" });

  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: {
        user_id: user.id,
        cart_items: cartMetadataJson,
        total_cents: totalCents.toString(),
      },
      payment_intent_data: {
        receipt_email: user.email,
        metadata: {
          user_id: user.id,
          total_cents: totalCents.toString(),
        },
      },
    });

    return json({ url: session.url }, 200);
  } catch (err) {
    console.error("[create-payment] Stripe session creation failed", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: "Stripe session creation failed", code: "STRIPE_ERROR", message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
