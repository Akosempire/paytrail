# PayTrail

Branded quotations, invoices and receipts for freelancers and companies.

A business sends a quote → the customer opens a link, accepts and pays (Stripe, Paystack, Flutterwave, Bachs or bank transfer) → the quote becomes a paid invoice and a numbered receipt is issued. Every document carries the business's own logo, colour and details. Each quote can hold **hidden cost lines** (data, electricity, transport, software…) so the team sees real profit and margin; customers never see them.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) · Tailwind CSS 4 · pdf-lib. Design system: Kasuwa (Figtree, cool-grey canvas, one confident blue).

---

## What's inside

| Area | Where | Who |
|---|---|---|
| Sign up, onboarding (freelancer or company, branding, money, team) | `/signup`, `/onboarding` | Everyone |
| Dashboard: owed, collected, open quotes, profit, needs-attention | `/app` | Members |
| Quotes and invoices with hidden costs, margin and a pricing helper | `/app/quotes`, `/app/invoices`, `/app/documents/[id]` | Members (costs: allowed members only) |
| Customers, payments and receipts ledger | `/app/customers`, `/app/payments` | Members |
| Business and branding, payment setup guide, team and roles, plan and billing, cost presets | `/app/settings/*` | Owner / manager (billing: owner) |
| Customer's link: view, accept/decline, pay, download PDF | `/d/[token]` | Customers (no login) |
| Receipt | `/r/[token]` | Customers |
| **Platform admin**: plans and pricing, trial rules, businesses, subscription billing | `/admin` | You (platform owner) |

### Roles (company accounts)

| Role | Can do |
|---|---|
| Owner | Everything, including billing. |
| Manager | Approves and sends, manages team (not other managers), branding and payments. |
| Finance officer | Creates, sends, records payments. Sees hidden costs. |
| Junior finance | Prepares drafts and submits them for approval. Sees hidden costs only if allowed. |

These rules are enforced **in the database** (row-level security and checked functions), not just in the UI.

---

## Setup (about 30 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run each file in `supabase/migrations/` **in order**: first `20261024000100_paytrail.sql` (every table, the security rules and the `logos` storage bucket), then `20261024000200_global_payments.sql` (adds Stripe and Paystack). Both are safe to run again later.
3. **Authentication → URL Configuration**
   - Site URL: your app address, e.g. `https://paytrail.yourdomain.com`
   - Redirect URLs: add `https://paytrail.yourdomain.com/auth/callback` (and `http://localhost:3000/auth/callback` for local work)
4. **Authentication → Emails → SMTP**: add your email provider so confirmation and reset emails come from your domain. The built-in sender is rate-limited.
5. **Project Settings → API**: copy the URL, the `anon` key and the `service_role` key for step 2.

### 2. Environment variables

Copy `.env.example` to `.env.local` (locally) or add them in Vercel → Settings → Environment Variables:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | From Supabase. Keep the service role key secret. |
| `NEXT_PUBLIC_SITE_URL` | Your app's public address, with no trailing slash. Used in payment links and webhook URLs. |
| `APP_ENCRYPTION_KEY` | 32+ random characters. Encrypts every business's payment keys. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Never change it later**, or saved keys can't be read. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional. Without it PayTrail still works: teams copy links or share them on WhatsApp instead of emailing. |
| `CRON_SECRET` | Random string. Protects the job that re-checks unconfirmed payments. |
| `PAYTRAIL_ALLOW_TEST_PAYMENTS` | Leave **unset** in production. Set to `1` only on a staging site to try test-card payments end to end. |

### 3. Deploy to Vercel

1. Push this folder to a new GitHub repo, then import it in Vercel (framework: Next.js). Add the env vars from step 2.
2. `vercel.json` runs `/api/cron/reconcile` every 15 minutes, which catches payments whose webhook never arrived. The Vercel Hobby plan only allows daily cron jobs. On Hobby, change the schedule to `0 6 * * *`, or use Pro.

### 4. Make yourself the platform owner

Sign up in the app first, then in the Supabase SQL Editor run:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@yourdomain.com';
```

Refresh the app. **Platform admin** now appears in the sidebar (`/admin`).

### 5. Set pricing and the trial (no code needed)

- **/admin/plans**: create your plans: name, price, monthly or yearly, document limit, team seats, whether companies can choose it, and feature bullets. Prices show on the landing page and on every business's billing page immediately.
- **/admin/settings**:
  - **Trial:** the default is **2 free documents** per business. You can switch to a number of days, or no trial. A document counts when it's sent; converting a quote into an invoice doesn't count twice.
  - **Collecting subscriptions:**
    - *Bank transfer:* you activate plans by hand in **/admin/businesses → Manage**.
    - *Stripe, Paystack, Flutterwave or Bachs:* paste PayTrail's **own** account keys and add the webhook URL shown there. Plans then activate automatically when paid. Use **Stripe** if you want businesses outside Africa to pay you in dollars, pounds or euros.

---

## How business payments work

Each business connects its **own** payment account in **Settings → Payment setup**, using the in-app guide. The screen suggests the best provider for the business's currency:

| Provider | Where it works | Webhook secret |
|---|---|---|
| **Stripe** | US, UK, EU, Canada, Australia and 40+ other countries | Signing secret (`whsec_…`) |
| **Paystack** | Nigeria, Ghana, Kenya, South Africa, Côte d'Ivoire | None (Paystack signs with the secret key) |
| **Flutterwave** | Across Africa | A secret hash you choose |
| **Bachs** | Where Bachs operates | Signing secret |

Setup steps:

1. Paste the secret key. PayTrail checks it with the provider, then stores it encrypted.
2. Add the webhook URL shown (it's unique to that business) and paste the webhook secret if the provider uses one.
3. Make a small test payment.

A provider only shows **Connected** after the test payment is confirmed **and** its webhook has reached PayTrail. **Customers only see the Pay button for live-mode connections**, so nobody can "pay" an invoice with a test card.

Every payment is re-verified with the provider's API before an invoice is marked paid. Amount, currency and reference must match exactly. A replayed webhook can't pay twice. If money arrives for a document that was already paid or cancelled, it's flagged as **needs review** in the document's activity.

Bank transfers, cash and POS are recorded by finance with **Record payment**, which issues a receipt the same way. Part payments are supported.

> **Stripe** uses hosted Checkout Sessions and the `checkout.session.completed` webhook. **Paystack** uses Transaction Initialize/Verify and the `x-paystack-signature` webhook header.
>
> **Bachs API note:** the integration uses the Bachs endpoints from your existing CREATIVEYATI code (`/v1/checkout-sessions`, `/v1/balances`, and HMAC-signed webhooks with the `x-bachs-timestamp` and `x-bachs-signature` headers). **Flutterwave** uses the v3 Standard checkout and `verif-hash` webhooks. Before going live, run one live test payment with each provider you enable.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in a Supabase project (a free one is fine for development)
npm run dev                  # http://localhost:3000
```

**Preview mode (no Supabase):** sample data for every screen, local only. It is ignored in production builds.

```bash
PAYTRAIL_PREVIEW=1 PAYTRAIL_PREVIEW_ROLE=owner NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
NEXT_PUBLIC_SUPABASE_URL=http://localhost:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
APP_ENCRYPTION_KEY=preview-preview-preview-preview-xx npm run dev
```

Set `PAYTRAIL_PREVIEW_ROLE` to `manager`, `finance` or `junior_finance` to see what each role sees.

**Tests**

```bash
npm test          # money maths, encryption, webhook signatures, provider responses
npm run test:db   # 17 database security tests (needs a local PostgreSQL 16; see scripts/test-db.sh)
```

## Folder map

```
app/            pages and server actions (app/app = signed-in app, app/admin = platform owner, app/d + app/r = customer links)
components/     design-system components (ui.js), app shell, editor, document view
lib/            Supabase clients, permissions, money, PDFs, email, payments (stripe, paystack, flutterwave, bachs, webhooks)
supabase/       migration (schema + security) and database tests
assets/fonts/   Lato (open licence) for PDFs, which includes the ₦ sign
```
