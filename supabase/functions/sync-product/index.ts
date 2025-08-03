import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productId } = await req.json();
    if (!productId) throw new Error("Product ID is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();
    if (error || !product) throw error ?? new Error("Product not found");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    let stripeProductId = product.stripe_product_id as string | null;
    let stripePriceId = product.stripe_price_id as string | null;

    if (!stripeProductId) {
      const created = await stripe.products.create({
        name: product.name,
        description: product.description ?? undefined,
      });
      stripeProductId = created.id;
    } else {
      await stripe.products.update(stripeProductId, {
        name: product.name,
        description: product.description ?? undefined,
      });
    }

    const amount = Math.round(product.price * 100);
    if (!stripePriceId) {
      const price = await stripe.prices.create({
        unit_amount: amount,
        currency: "usd",
        product: stripeProductId,
      });
      stripePriceId = price.id;
    } else {
      const existing = await stripe.prices.retrieve(stripePriceId);
      if (existing.unit_amount !== amount) {
        await stripe.prices.update(stripePriceId, { active: false });
        const price = await stripe.prices.create({
          unit_amount: amount,
          currency: "usd",
          product: stripeProductId,
        });
        stripePriceId = price.id;
      }
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
      })
      .eq("id", productId);
    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ stripe_product_id: stripeProductId, stripe_price_id: stripePriceId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Sync product error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
