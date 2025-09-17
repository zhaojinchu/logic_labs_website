-- Add Stripe integration fields to orders and order_items
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

CREATE INDEX IF NOT EXISTS orders_stripe_session_idx
  ON public.orders (stripe_checkout_session_id);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_name TEXT;
