-- Clear cart items first to avoid foreign key violations
DELETE FROM public.cart_items;

-- Remove existing products
DELETE FROM public.products;

-- Insert introduction to logic gates kit
INSERT INTO public.products (
  name,
  description,
  price,
  category,
  skill_level,
  age_group,
  stock_quantity,
  stripe_product_id,
  stripe_price_id
) VALUES (
  'Logic Gates Kit',
  'Work with transistors and breadboards to build fundamental logic gates from scratch.',
  49.99,
  'electronics',
  'beginner',
  'high_school',
  50,
  NULL,
  NULL
);

-- Insert fibonacci clock kit
INSERT INTO public.products (
  name,
  description,
  price,
  category,
  skill_level,
  age_group,
  stock_quantity,
  stripe_product_id,
  stripe_price_id
) VALUES (
  'Fibonacci Clock Kit',
  'PCB-based clock kit that displays time using the Fibonacci sequence.',
  59.99,
  'electronics',
  'intermediate',
  'high_school',
  30,
  NULL,
  NULL
);
