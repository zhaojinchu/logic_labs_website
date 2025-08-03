import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  stripe_price_id?: string;
  price: number;
  quantity: number;
  product_name: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Create Supabase client using the anon key for user authentication
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Retrieve authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    // Parse request body to get cart items
    const { cartItems } = (await req.json()) as { cartItems: CartItem[] };
    if (!cartItems || cartItems.length === 0) {
      throw new Error("No items in cart");
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if a Stripe customer record exists for this user
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create line items for Stripe checkout and calculate total
    const lineItems = [] as (
      | { price: string; quantity: number }
      | { price_data: { currency: string; unit_amount: number; product_data: { name: string } }; quantity: number }
    )[];
    let totalAmount = 0;
    for (const item of cartItems) {
      const priceId = item.stripe_price_id?.trim();
      if (priceId) {
        try {
          await stripe.prices.retrieve(priceId);
          lineItems.push({ price: priceId, quantity: item.quantity });
        } catch (_) {
          lineItems.push({
            price_data: {
              currency: "usd",
              unit_amount: Math.round(item.price * 100),
              product_data: { name: item.product_name },
            },
            quantity: item.quantity,
          });
        }
      } else {
        lineItems.push({
          price_data: {
            currency: "usd",
            unit_amount: Math.round(item.price * 100),
            product_data: { name: item.product_name },
          },
          quantity: item.quantity,
        });
      }
      totalAmount += item.price * item.quantity;
    }

    const origin =
      req.headers.get("origin") || Deno.env.get("SITE_URL") || "";
    if (!origin) {
      throw new Error("Site URL not configured");
    }

    const origin =
      req.headers.get("origin") || Deno.env.get("SITE_URL") || "";
    if (!origin) {
      throw new Error("Site URL not configured");
    }

    // Create a one-time payment session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: {
        user_id: user.id,
        total_amount: totalAmount.toString(),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});