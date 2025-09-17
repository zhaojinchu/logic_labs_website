# Logic Labs Commerce Platform

An end-to-end e-commerce experience for Logic Labs’ STEM electronics kits. The project pairs a React + Vite frontend with Supabase for authentication/data storage and Stripe for payments. It includes Supabase Edge Functions to orchestrate checkout and orders, a cart flow, and a Stripe webhook that persists completed purchases.

## Table of Contents
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Environment Configuration](#environment-configuration)
- [Database Migrations](#database-migrations)
- [Supabase Edge Functions](#supabase-edge-functions)
- [Stripe Integration](#stripe-integration)
- [Running the App](#running-the-app)
- [Testing the Payment Flow](#testing-the-payment-flow)
- [Deployment Checklist](#deployment-checklist)
- [Troubleshooting](#troubleshooting)

## Tech Stack
- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) for the SPA frontend
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/) for styling and components
- [Supabase](https://supabase.com/) for authentication, database, and edge functions
- [Stripe Checkout](https://stripe.com/payments/checkout) for payments

## Project Structure
```
logic-labs/
├─ src/                  # React application
│  ├─ pages/             # Index, PaymentSuccess, NotFound
│  ├─ hooks/             # Cart management
│  └─ integrations/      # Supabase client/types
├─ supabase/
│  ├─ functions/         # Edge functions
│  │  ├─ create-payment/
│  │  ├─ retrieve-session/
│  │  └─ stripe-webhook/
│  └─ migrations/        # Database schema
├─ scripts/              # Utilities (e.g., sync Stripe products)
├─ public/               # Static assets
├─ package.json
└─ README.md
```

## Prerequisites
- Node.js 18+
- npm 9+ (bundled with Node); Bun is optional but not required
- Supabase CLI v1.150.1+ (`npm install -g supabase`)
- Stripe CLI (`npm install -g stripe`)
- A Supabase project and Stripe account (test mode is fine)

## Local Development
1. **Clone & install**
   ```bash
   git clone <repo-url>
   cd logic-labs
   npm install
   ```

2. **Set environment variables** for the frontend: copy `.env.example` (if present) to `.env.local` and fill in the Supabase URL and anon key. During local dev you can use `SITE_URL=http://localhost:5173`.

3. **Start Vite**
   ```bash
   npm run dev
   ```

The app runs on [http://localhost:5173](http://localhost:5173).

## Environment Configuration
The Supabase Edge Functions reuse a shared secret store. Set these values once:

| Key | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (Project Settings → API) |
| `SUPABASE_ANON_KEY` | Public anon key (same page) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (same page) – **keep private** |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe signing secret (`whsec_...`) |
| `SITE_URL` | Base URL used in success/cancel URLs (`http://localhost:5173` during dev) |

Set them locally in `.env` for scripts and the Vite app. For Supabase functions, push them with:
```bash
supabase secrets set \
  SUPABASE_URL=... \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  STRIPE_SECRET_KEY=... \
  STRIPE_WEBHOOK_SECRET=... \
  SITE_URL=http://localhost:5173
```

Supabase applies these secrets to all functions in the project.

## Database Migrations
Supabase migrations live under `supabase/migrations/`.

1. If your remote database already contains the base schema (products/orders tables), mark the initial migration as applied:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('20250803145247', '337211b6-c370-4de4-829e-7985558a0de8')
   on conflict (version) do nothing;
   ```

2. Apply the Stripe-specific fields (adds receipt and session metadata):
   ```sql
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
   ```

3. Alternatively, with a clean database and the Supabase CLI logged in:
   ```bash
   supabase db push
   ```

Verify the tables in the Supabase dashboard or via `psql` once complete.

## Supabase Edge Functions
Three functions coordinate checkout:

| Function | Purpose |
| --- | --- |
| `create-payment` | Receives the user’s cart, validates it against the database with service-role privileges, creates a Stripe Checkout session, and returns the redirect URL. |
| `stripe-webhook` | Handles `checkout.session.completed`, verifies the Stripe signature, persists the order and line items, clears the cart, and stores the Stripe receipt URL. |
| `retrieve-session` | Returns the order summary for the authenticated user after redirect back from Stripe. |

Deploy (or redeploy) them from the project root:
```bash
supabase functions deploy create-payment
supabase functions deploy retrieve-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

`stripe-webhook` must be deployed with `--no-verify-jwt`; Stripe doesn’t send Supabase tokens.

To tail logs for any function:
```bash
supabase functions logs create-payment --tail
```
(Replace `create-payment` with any function name.)

## Stripe Integration
1. **Stripe CLI login**
   ```bash
   stripe login
   ```

2. **Set up a local listener** and capture the signing secret:
   ```bash
   stripe listen --events checkout.session.completed \
     --forward-to https://wzrbmcozoouvyonsvbxp.functions.supabase.co/stripe-webhook
   ```
   Stripe prints `whsec_...`; store it in Supabase secrets as `STRIPE_WEBHOOK_SECRET`.

3. **Dashboard webhook (production)**
   - In the Stripe Dashboard go to *Developers → Webhooks → Add endpoint*.
   - Point it to the deployed `stripe-webhook` URL.
   - Subscribe to `checkout.session.completed`.
   - Copy the signing secret and update `STRIPE_WEBHOOK_SECRET`.

4. **Enable email receipts** under *Settings → Emails* to let Stripe send confirmations automatically.

## Running the App
- `npm run dev` – start the frontend
- `npm run build` – build for production (use Vite’s preview server or deploy as desired)

## Testing the Payment Flow
1. Launch the frontend and log in (Supabase email magic link or OAuth).
2. Add items to the cart.
3. Click checkout. The frontend invokes `create-payment`, then redirects to Stripe Checkout.
4. Pay with a test card (e.g., `4242 4242 4242 4242`, any future date, any CVC/ZIP).
5. Stripe redirects back to `/payment-success?session_id=...`. The page calls `retrieve-session`, displays the order summary, and links to the Stripe receipt.
6. Verify in Supabase that:
   - `orders` contains the new record with `stripe_checkout_session_id` & `receipt_url`.
   - `order_items` contains line items (with captured product names).
   - `cart_items` for that user is empty.

If the order doesn’t appear, tail function logs (`create-payment` and `stripe-webhook`) to troubleshoot.

## Deployment Checklist
- [ ] Environment secrets set in Supabase (`supabase secrets set ...`).
- [ ] Database migrations applied (orders/order_items have Stripe columns).
- [ ] All three edge functions deployed; `stripe-webhook` deployed with `--no-verify-jwt`.
- [ ] Stripe webhook configured with the correct URL and signing secret.
- [ ] SITE_URL updated to the production domain before deploying the frontend.
- [ ] Stripe test checkout completed end-to-end.

## Troubleshooting
| Symptom | Possible Cause | Action |
| --- | --- | --- |
| `create-payment` returns 500 | Missing env vars, cart mismatch, Stripe API error | Check Supabase logs; errors now include codes (e.g., `CONFIG_MISSING`, `CART_MISMATCH`, `STRIPE_ERROR`). |
| Stripe webhook 401 | Function deployed without `--no-verify-jwt` | Redeploy `supabase functions deploy stripe-webhook --no-verify-jwt`. |
| “Webhook signature verification failed … SubtleCryptoProvider …” | Using synchronous verifier | Ensure the code calls `constructEventAsync` (already applied in repo) and redeploy. |
| `retrieve-session` returns 404 | Order not persisted yet | Confirm webhook ran; check Stripe live/test mode. |
| `column order_items.product_name does not exist` | Migration missing | Run the SQL snippet in [Database Migrations](#database-migrations). |
| Cart not cleared after payment | Webhook failed early | Review `stripe-webhook` logs for insert/delete errors. |

## Contributing
1. Fork the repo and create a feature branch.
2. Install dependencies and run `npm run dev`.
3. Keep linting/style consistent (ESLint/Tailwind config included).
4. Submit a PR with a clear description and testing notes.

## License
MIT © Logic Labs
