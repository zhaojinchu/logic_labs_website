import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/*────────────────────────  CONFIG  ────────────────────────*/
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")  ?? "";
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY2") ?? "";
const SITE_URL      = Deno.env.get("SITE_URL") ?? "";

console.log(STRIPE_SECRET)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/*────────────────────────  TYPES  ─────────────────────────*/
interface CartItem {
  stripe_price_id?: string;
  price: number;            // USD
  quantity: number;
  product_name: string;
}

/*───────────────────────  HANDLER  ───────────────────────*/
serve(async (req) => {
  /* CORS pre-flight --------------------------------------------------------*/
  if (req.method === "OPTIONS")
    return new Response(null, { headers: cors });

  /* Auth -------------------------------------------------------------------*/
  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return json({ error: "Missing bearer token" }, 401);

  const jwt = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !user?.email)
    return json({ error: "Invalid or expired token" }, 401);

  /* Parse body -------------------------------------------------------------*/
  let cart: CartItem[];
  try {
    ({ cartItems: cart } = await req.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(cart) || cart.length === 0)
    return json({ error: "Cart is empty" }, 400);

  /* Stripe -----------------------------------------------------------------*/
  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2023-10-16" });

  // Find or create customer
  let customerId: string | undefined;
  const { data: custs } = await stripe.customers.list({
    email: user.email,
    limit: 1,
  });
  if (custs.length) customerId = custs[0].id;

  // Build line items + total
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let totalCents = 0;

  const myprice = await stripe.products.retrieve("prod_Sngih7lAV25oPT");
  console.log(myprice)

  for (const item of cart) {
    const { stripe_price_id, price, quantity, product_name } = item;

    /* ─────── DEBUG ─────── */
    console.log("🛒 cart item", item);
    /* ───────────────────── */

    if (stripe_price_id && stripe_price_id.startsWith("price_")) {
      line_items.push({ price: stripe_price_id, quantity });
    } else {
      line_items.push({
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: { name: product_name },
        },
        quantity,
      });
    }

    totalCents += Math.round(price * 100) * quantity;
  }   
  

  const origin =
    req.headers.get("origin") ??
    SITE_URL ??
    ""; // fallback prevents undefined in URLs

  if (!origin)
    return json({ error: "SITE_URL env var not set" }, 500);


  try {
    console.log("Entered TRY")
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items,
      mode: "payment",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/`,
      metadata: {
        user_id: user.id,
        total_amount_cents: totalCents.toString(),
      },
    });
    console.log("SOMETHING")
    return json({ url: session.url }, 200);
  } catch (err) {
    console.error("Stripe error:", err);
    return json({ error: "Stripe session creation failed" }, 500);
  }
});

/*──────────────────────── helpers ────────────────────────*/
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
