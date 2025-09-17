# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/5e36d3b9-5c96-4215-8f4b-7b1fb4028960

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/5e36d3b9-5c96-4215-8f4b-7b1fb4028960) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/5e36d3b9-5c96-4215-8f4b-7b1fb4028960) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Syncing Stripe products

To sync products between Supabase and Stripe:

1. Copy `.env.example` to `.env`.
2. Fill in the following values in `.env`:
   - `SUPABASE_URL=your-supabase-project-url`
   - `SUPABASE_SERVICE_ROLE_KEY=service-key`
   - `STRIPE_SECRET_KEY=stripe-secret-key`
3. Run `npm run sync:stripe` to perform the synchronization.

## Payment flow configuration

The checkout flow relies on Supabase Edge Functions:

- `create-payment` – creates a Stripe Checkout session using the authenticated user’s cart.
- `stripe-webhook` – listens for `checkout.session.completed` events, records orders in Supabase, clears the cart, and captures Stripe receipt links.
- `retrieve-session` – returns an order summary for the signed-in user after redirecting from Stripe.

Make sure the following environment variables are available to your Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SITE_URL` (used to build success/cancel URLs)

After deploying the functions (`supabase functions deploy <name>`), create a Stripe webhook endpoint that points to the deployed `stripe-webhook` function and subscribe it to `checkout.session.completed`. Enable email receipts in your Stripe Dashboard so customers receive confirmations automatically.
