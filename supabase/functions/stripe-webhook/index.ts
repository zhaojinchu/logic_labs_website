import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
  console.error("Missing required environment variables for stripe-webhook function");
}

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2023-10-16" });

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });

  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET)
    return new Response("Server configuration error", { status: 500 });

  const signature = req.headers.get("stripe-signature");
  if (!signature)
    return new Response("Missing Stripe signature", { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed")
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.user_id;

  if (!userId) {
    console.warn("checkout.session.completed event without user metadata", session.id);
    return new Response(JSON.stringify({ ignored: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let cartMetadata: CartMetadataItem[] = [];
  if (session.metadata?.cart_items) {
    try {
      cartMetadata = JSON.parse(session.metadata.cart_items) as CartMetadataItem[];
    } catch (err) {
      console.error("Failed to parse cart metadata", err);
    }
  }

  if (!cartMetadata.length)
    console.warn("No cart metadata found for session", session.id);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let paymentIntentId: string | null = null;
  if (typeof session.payment_intent === "string")
    paymentIntentId = session.payment_intent;
  else if (session.payment_intent && typeof session.payment_intent === "object")
    paymentIntentId = session.payment_intent.id;

  let receiptUrl: string | null = null;
  if (paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const latestCharge = paymentIntent.latest_charge as Stripe.Charge | undefined;
      if (latestCharge?.receipt_url)
        receiptUrl = latestCharge.receipt_url;
    } catch (err) {
      console.error("Failed to retrieve payment intent", err);
    }
  }

  let lineItems: Stripe.ApiList<Stripe.LineItem> | null = null;
  try {
    lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  } catch (err) {
    console.error("Failed to fetch checkout session line items", err);
  }

  const shippingDetails = session.customer_details;
  const shippingAddress = shippingDetails?.address
    ? {
        name: shippingDetails.name,
        email: shippingDetails.email ?? session.customer_email ?? null,
        phone: shippingDetails.phone,
        address: shippingDetails.address,
      }
    : null;

  const paymentStatus = session.payment_status === "paid" ? "processing" : "pending";

  const currency = session.currency ? session.currency.toUpperCase() : "USD";

  const orderPayload = {
    user_id: userId,
    total_amount: Number(((session.amount_total ?? 0) / 100).toFixed(2)),
    status: paymentStatus,
    shipping_address: shippingAddress,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    receipt_url: receiptUrl,
    currency,
    customer_email: shippingDetails?.email ?? session.customer_email ?? null,
  };

  const { data: existingOrder, error: orderLookupError } = await adminClient
    .from("orders")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (orderLookupError) {
    console.error("Failed to lookup existing order", orderLookupError);
    return new Response("Order lookup failed", { status: 500 });
  }

  let orderId: string | null = existingOrder?.id ?? null;

  if (orderId) {
    const { error: updateError } = await adminClient
      .from("orders")
      .update(orderPayload)
      .eq("id", orderId);

    if (updateError) {
      console.error("Failed to update existing order", updateError);
      return new Response("Order update failed", { status: 500 });
    }
  } else {
    const { data: insertedOrder, error: insertError } = await adminClient
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert new order", insertError);
      return new Response("Order insert failed", { status: 500 });
    }

    orderId = insertedOrder.id;
  }

  if (!orderId)
    return new Response("Order ID missing", { status: 500 });

  const lineItemsRemaining = lineItems ? [...lineItems.data] : [];
  const lineItemsByPriceId = new Map<string, Stripe.LineItem[]>();

  for (const item of lineItemsRemaining) {
    const priceId = item.price?.id;
    if (!priceId)
      continue;
    const list = lineItemsByPriceId.get(priceId) ?? [];
    list.push(item);
    lineItemsByPriceId.set(priceId, list);
  }

  const removeFromRemaining = (line?: Stripe.LineItem) => {
    if (!line)
      return;
    const index = lineItemsRemaining.findIndex((entry) => entry.id === line.id);
    if (index >= 0)
      lineItemsRemaining.splice(index, 1);
  };

  const orderItemsPayload = cartMetadata.map((item) => {
    let matchedLine: Stripe.LineItem | undefined;

    if (item.stripe_price_id) {
      const matches = lineItemsByPriceId.get(item.stripe_price_id);
      if (matches?.length) {
        matchedLine = matches.shift();
        if (!matches.length)
          lineItemsByPriceId.delete(item.stripe_price_id);
      }
    }

    if (matchedLine) {
      removeFromRemaining(matchedLine);
    } else if (lineItemsRemaining.length) {
      matchedLine = lineItemsRemaining.shift();
    }

    const quantity = item.quantity > 0 ? item.quantity : matchedLine?.quantity ?? 0;
    const fallbackUnitCents = matchedLine?.price?.unit_amount ?? (
      matchedLine?.amount_subtotal && matchedLine?.quantity
        ? Math.round((matchedLine?.amount_subtotal ?? 0) / (matchedLine?.quantity ?? 1))
        : 0
    );
    const unitAmountCents = item.unit_amount_cents || fallbackUnitCents || 0;
    const unitAmount = Number((unitAmountCents / 100).toFixed(2));

    return {
      order_id: orderId as string,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity,
      price: unitAmount,
    };
  });

  const filteredOrderItems = orderItemsPayload.filter((item) => item.quantity > 0 && item.price >= 0);

  const { error: deleteError } = await adminClient
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteError) {
    console.error("Failed to clear existing order items", deleteError);
    return new Response("Order item cleanup failed", { status: 500 });
  }

  if (filteredOrderItems.length) {
    const { error: insertItemsError } = await adminClient
      .from("order_items")
      .insert(filteredOrderItems);

    if (insertItemsError) {
      console.error("Failed to insert order items", insertItemsError);
      return new Response("Order items insert failed", { status: 500 });
    }
  }

  const cartItemIds = cartMetadata.map((item) => item.cart_item_id).filter(Boolean);
  if (cartItemIds.length) {
    const { error: cartCleanupError } = await adminClient
      .from("cart_items")
      .delete()
      .in("id", cartItemIds);

    if (cartCleanupError)
      console.error("Failed to clear cart items", cartCleanupError);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
