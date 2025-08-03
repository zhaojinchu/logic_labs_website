import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecret || !supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncProducts() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, price, stripe_product_id, stripe_price_id');
  if (error) throw error;

  for (const product of products) {
    let { id, name, description, price, stripe_product_id, stripe_price_id } = product;

    // Ensure product exists in Stripe
    let stripeProductId = stripe_product_id;
    if (stripeProductId) {
      const stripeProduct = await stripe.products.update(stripeProductId, {
        name,
        description: description || undefined,
      });
      description = stripeProduct.description ?? description;
    } else {
      const list = await stripe.products.list({ limit: 100, active: true });
      const existing = list.data.find(p => p.name === name);
      if (existing) {
        stripeProductId = existing.id;
        description = existing.description ?? description;
      } else {
        const created = await stripe.products.create({
          name,
          description: description || undefined,
        });
        stripeProductId = created.id;
        description = created.description ?? description;
      }
    }

    // Ensure price exists and capture Stripe's price value
    let stripePriceId = stripe_price_id;
    let stripePrice;
    if (stripePriceId) {
      stripePrice = await stripe.prices.retrieve(stripePriceId);
    } else {
      const prices = await stripe.prices.list({ product: stripeProductId, active: true, limit: 1 });
      if (prices.data.length > 0) {
        stripePrice = prices.data[0];
        stripePriceId = stripePrice.id;
      } else {
        stripePrice = await stripe.prices.create({
          product: stripeProductId,
          unit_amount: Math.round(price * 100),
          currency: 'usd',
        });
        stripePriceId = stripePrice.id;
      }
    }
    price = (stripePrice.unit_amount || 0) / 100;

    const { error: updateError } = await supabase
      .from('products')
      .update({
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
        price,
        description,
      })
      .eq('id', id);
    if (updateError) {
      console.error('Failed to update product', id, updateError.message);
    } else {
      console.log(`Synced product ${name}`);
    }
  }
}

syncProducts()
  .then(() => {
    console.log('Sync complete');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
