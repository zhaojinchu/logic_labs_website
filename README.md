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

## Order processing configuration

Successful Stripe checkouts are finalized through the `stripe-webhook` Supabase Edge Function and confirmed on the `/payment-success` page via the `confirm-order` function. Make sure the following environment variables are configured for your Supabase functions runtime:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` (only required if you want to send confirmation emails via Resend)
- `ORDER_FROM_EMAIL` (the verified sender to use with Resend)
- `SITE_URL` (used for redirect URLs in the checkout flow)

After deploying the functions, point your Stripe webhook to `https://<project-ref>.functions.supabase.co/stripe-webhook` and subscribe to the `checkout.session.completed` event so orders are recorded and receipts are dispatched automatically.
