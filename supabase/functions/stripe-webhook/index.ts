import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ORDER_FROM_EMAIL = Deno.env.get("ORDER_FROM_EMAIL") ?? "";

const supabaseAdmin = (SUPABASE_URL && SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" })
  : null;

type CartMetadataItem = {
  product_id: string;
  quantity: number;
  price_cents: number;
  name?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  if (!stripe || !STRIPE_WEBHOOK_SECRET)
    return json({ error: "Stripe configuration missing" }, 500);

  if (!supabaseAdmin)
    return json({ error: "Supabase configuration missing" }, 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature)
    return json({ error: "Missing stripe signature" }, 400);

  const payload = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed", err);
    return json({ error: "Invalid signature" }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    } else {
      console.log(`Unhandled Stripe event: ${event.type}`);
    }
  } catch (err) {
    console.error(`Failed to process event ${event.id}`, err);
    return json({ error: "Failed to process webhook" }, 500);
  }

  return json({ received: true }, 200);
});

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin || !stripe)
    throw new Error("Missing configuration");

  const userId = session.metadata?.user_id;
  if (!userId) {
    console.warn(`Checkout session ${session.id} missing user_id metadata`);
    return;
  }

  const { data: existingOrder, error: existingError } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingOrder) {
    console.log(`Order ${existingOrder.id} already recorded for session ${session.id}`);
    return;
  }

  const cartItems = await buildOrderItems(session);

  const totalCents = typeof session.amount_total === "number"
    ? session.amount_total
    : Number(session.metadata?.total_amount_cents ?? 0);

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const customerEmail = session.customer_details?.email
    ?? session.customer_email
    ?? null;

  const shippingPayload = session.customer_details
    ? {
        name: session.customer_details.name,
        email: customerEmail,
        phone: session.customer_details.phone,
        address: session.customer_details.address,
      }
    : null;

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      total_amount: Number((totalCents / 100).toFixed(2)),
      status: "processing",
      shipping_address: shippingPayload,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      receipt_url: null,
      customer_email: customerEmail,
    })
    .select("id, created_at, total_amount")
    .single();

  if (orderError || !order)
    throw orderError ?? new Error("Failed to create order record");

  const orderItemsPayload = cartItems
    .filter((item) => item.product_id)
    .map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: Number((item.price_cents / 100).toFixed(2)),
    }));

  if (orderItemsPayload.length > 0) {
    const { error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItemsPayload);

    if (orderItemsError)
      throw orderItemsError;
  }

  const { error: clearCartError } = await supabaseAdmin
    .from("cart_items")
    .delete()
    .eq("user_id", userId);

  if (clearCartError)
    console.error(`Failed to clear cart for user ${userId}`, clearCartError);

  let receiptUrl: string | null = null;
  if (paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["charges"] });
      const metadataUpdate = { ...paymentIntent.metadata, order_id: order.id };
      const updatePayload: Stripe.PaymentIntentUpdateParams = { metadata: metadataUpdate };

      if (customerEmail && paymentIntent.receipt_email !== customerEmail)
        updatePayload.receipt_email = customerEmail;

      await stripe.paymentIntents.update(paymentIntent.id, updatePayload);

      const charge = paymentIntent.charges?.data?.[0];
      if (charge?.receipt_url) {
        receiptUrl = charge.receipt_url;
      } else if (typeof paymentIntent.latest_charge === "string") {
        try {
          const latestCharge = await stripe.charges.retrieve(paymentIntent.latest_charge);
          receiptUrl = latestCharge.receipt_url ?? null;
        } catch (chargeError) {
          console.error("Failed to retrieve latest charge", chargeError);
        }
      }
    } catch (intentError) {
      console.error("Failed to process payment intent", intentError);
    }
  }

  const { error: updateOrderError } = await supabaseAdmin
    .from("orders")
    .update({
      receipt_url: receiptUrl,
      customer_email: customerEmail,
    })
    .eq("id", order.id);

  if (updateOrderError)
    console.error("Failed to update order with receipt information", updateOrderError);

  if (customerEmail)
    await sendConfirmationEmail({
      to: customerEmail,
      orderId: order.id,
      createdAt: order.created_at,
      totalCents,
      receiptUrl,
      items: cartItems,
    });
}

async function buildOrderItems(session: Stripe.Checkout.Session): Promise<CartMetadataItem[]> {
  if (!stripe)
    return [];

  const metadataItems = parseCartMetadata(session.metadata?.cart);

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  const combined: CartMetadataItem[] = [];

  for (let i = 0; i < lineItems.data.length; i++) {
    const line = lineItems.data[i];
    const metadata = metadataItems[i];

    const quantity = line.quantity ?? metadata?.quantity ?? 1;
    const amountSubtotal = typeof line.amount_subtotal === "number"
      ? line.amount_subtotal
      : (metadata?.price_cents ?? 0) * quantity;
    const unitAmount = quantity > 0 ? amountSubtotal / quantity : metadata?.price_cents ?? 0;

    combined.push({
      product_id: metadata?.product_id ?? "",
      quantity,
      price_cents: Math.round(unitAmount),
      name: metadata?.name ?? line.description ?? undefined,
    });
  }

  return combined;
}

function parseCartMetadata(raw: string | null | undefined): CartMetadataItem[] {
  if (!raw)
    return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return [];

    return parsed
      .filter((item) => item && typeof item.p === "string")
      .map((item) => ({
        product_id: item.p as string,
        quantity: typeof item.q === "number" ? item.q : Number(item.q) || 1,
        price_cents: typeof item.pr === "number" ? item.pr : Number(item.pr) || 0,
        name: typeof item.n === "string" ? item.n : undefined,
      }));
  } catch (error) {
    console.error("Failed to parse cart metadata", error);
    return [];
  }
}

async function sendConfirmationEmail(params: {
  to: string;
  orderId: string;
  createdAt: string;
  totalCents: number;
  receiptUrl: string | null;
  items: CartMetadataItem[];
}) {
  const { to, orderId, createdAt, totalCents, receiptUrl, items } = params;

  if (!RESEND_API_KEY || !ORDER_FROM_EMAIL) {
    console.warn("Email configuration missing; skipping confirmation email");
    return;
  }

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const itemsHtml = items
    .map((item) => `
      <tr>
        <td style="padding: 4px 8px; border: 1px solid #e5e7eb;">${escapeHtml(item.name ?? "Item")}</td>
        <td style="padding: 4px 8px; border: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 4px 8px; border: 1px solid #e5e7eb; text-align: right;">${currencyFormatter.format((item.price_cents * item.quantity) / 100)}</td>
      </tr>
    `)
    .join("");

  const totalFormatted = currencyFormatter.format(totalCents / 100);
  const receiptLink = receiptUrl
    ? `<p>You can download your Stripe receipt <a href="${receiptUrl}">here</a>.</p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <h2 style="color: #047857;">Thank you for your order!</h2>
      <p>Order ID: <strong>${orderId}</strong></p>
      <p>Order date: ${new Date(createdAt).toLocaleString()}</p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 16px;">
        <thead>
          <tr>
            <th style="padding: 6px 8px; border: 1px solid #e5e7eb; text-align: left;">Item</th>
            <th style="padding: 6px 8px; border: 1px solid #e5e7eb;">Qty</th>
            <th style="padding: 6px 8px; border: 1px solid #e5e7eb; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <p style="margin-top: 16px; font-size: 16px;">Order total: <strong>${totalFormatted}</strong></p>
      ${receiptLink}
      <p style="margin-top: 24px;">We'll send another update when your kits ship.</p>
    </div>
  `;

  const text = [
    `Thank you for your order!`,
    `Order ID: ${orderId}`,
    `Order date: ${new Date(createdAt).toLocaleString()}`,
    ...items.map((item) => `- ${item.quantity} x ${item.name ?? "Item"}`),
    `Total: ${totalFormatted}`,
    receiptUrl ? `Receipt: ${receiptUrl}` : "",
  ].filter(Boolean).join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ORDER_FROM_EMAIL,
      to: [to],
      subject: "Your Logic Labs order confirmation",
      html,
      text,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("Failed to send confirmation email", message);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
