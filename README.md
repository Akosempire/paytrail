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
2. **SQL Editor** → run each file in `supabase/migrations/` **in order**: first `20261024000100_paytrail.sql` (every table, the security rules and the `logos` storage bucket), then `20261024000200_global_payments.sql` (adds Stripe and Paystack), then `20261024000300_pricing.sql` (default plans and a 14-day trial), then `20261024000400_privacy.sql` (data download and deletion), `20261024000500_templates.sql` (document templates and paper sizes) and `20261024000600_security_codes.sql` (emailed security codes). All are safe to run again later.
   - Choose an **EU region** (e.g. Frankfurt) when creating the project: Supabase has no Nigerian region, and the EU satisfies both NDPA and GDPR transfer rules.
3. **Authentication → URL Configuration**
   - Site URL: your app address, e.g. `https://paytrail.yourdomain.com`
   - Redirect URLs: add `https://paytrail.yourdomain.com/auth/callback` (and `http://localhost:3000/auth/callback` for local work)
4. **Authentication → Emails → SMTP**: add Brevo (host `smtp-relay.brevo.com`, port `587`, your Brevo SMTP login and SMTP key). The built-in sender is rate-limited.
   - **Authentication → Emails → Confirm signup**: paste `supabase/email-templates/confirm-signup.html` and set the subject to `Your PayTrail code: {{ .Token }}`. New users type this 6-digit code to confirm their email (the link in the email works too).
5. **Project Settings → API**: copy the URL, the `anon` key and the `service_role` key for step 2.

### 2. Environment variables

Copy `.env.example` to `.env.local` (locally) or add them in Vercel → Settings → Environment Variables:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | From Supabase. Keep the service role key secret. |
| `NEXT_PUBLIC_SITE_URL` | Your app's public address, with no trailing slash. Used in payment links and webhook URLs. |
| `APP_ENCRYPTION_KEY` | 32+ random characters. Encrypts every business's payment keys. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Never change it later**, or saved keys can't be read. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Brevo: `smtp-relay.brevo.com`, `587`, your Brevo SMTP **login** (e.g. `9a1b2c001@smtp-brevo.com`), your SMTP **key** (`xsmtpsib-…`), and a sender you verified in Brevo. Needed for security codes, emailing documents and admin alerts. Without it PayTrail still runs, but security codes can't be sent, so that protection is off. |
| `ADMIN_ALERT_EMAILS` | Optional. Who gets admin alerts (new businesses, payment key changes). Empty = every platform admin. |
| `CRON_SECRET` | Random string. Protects the job that re-checks unconfirmed payments. |
| `LEGAL_COMPANY_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` | Shown on `/terms`, `/privacy` and `/dpa`. Use your registered business name and address. |
| `LEGAL_DATA_REGION`, `LEGAL_EMAIL_PROVIDER` | Shown on `/subprocessors`, e.g. `European Union (Frankfurt)` and `Brevo`. |
| `PAYTRAIL_ALLOW_TEST_PAYMENTS` | Leave **unset** in production. Set to `1` only on a staging site to try test-card payments end to end. |

### 3. Deploy to Vercel

1. Push this folder to a new GitHub repo, then import it in Vercel (framework: Next.js). Add the env vars from step 2.
2. Payments whose webhook never arrived are re-checked automatically in the background whenever a team opens PayTrail or a customer opens their link (at most every 2 minutes), so this works on any Vercel plan. `vercel.json` also runs `/api/cron/reconcile` once a day as a safety net (allowed on the free Hobby plan). On Vercel Pro you can make it every 15 minutes: change the schedule to `*/15 * * * *`.
3. **Legal pages:** `/terms` and `/privacy` are ready-made starting points written for a Nigerian business serving customers worldwide. Have a lawyer review them before launch.

### 4. Make yourself the platform owner

Sign up in the app first, then in the Supabase SQL Editor run:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@yourdomain.com';
```

Refresh the app. **Platform admin** now appears in the sidebar (`/admin`).

### 5. Set pricing and the trial (no code needed)

- **Default plans** (added by the pricing migration, all editable):

  | Plan | Naira monthly / yearly | US dollar monthly / yearly | Documents a month | Users |
  |---|---|---|---|---|
  | Solo (freelancers) | ₦3,000 / ₦30,000 | $5 / $50 | 50 | 1 |
  | Team | ₦7,500 / ₦75,000 | $15 / $150 | 200 | 5 |
  | Business | ₦20,000 / ₦200,000 | $39 / $390 | Unlimited | 15 |
  | Founding (hidden) | ₦60,000 a year, locked | — | 200 | 5 |

  Businesses see plans in their own currency (dollars if there's no plan in theirs). There's no free-forever plan: after the 14-day trial a business keeps all its data but needs a paid plan to send new quotes and invoices. Assign **Founding** (Team features) to early customers from **/admin/businesses → Manage**; it isn't shown publicly and its price doesn't change when you raise public prices.
- **/admin/plans**: edit or add plans: name, price, monthly or yearly, document limit, team seats, whether companies can choose it, and feature bullets. Prices show on the landing page and on every business's billing page immediately.
- **/admin/settings**:
  - **Trial:** the default is a **14-day free trial**. You can switch to a number of free documents, or no trial. A document counts when it's sent; converting a quote into an invoice doesn't count twice.
  - **Collecting subscriptions:**
    - *Bank transfer:* you activate plans by hand in **/admin/businesses → Manage**.
    - *Stripe, Paystack, Flutterwave or Bachs:* paste PayTrail's **own** account keys and add the webhook URL shown there. Plans then activate automatically when paid. Use **Stripe** if you want businesses outside Africa to pay you in dollars, pounds or euros.

---

## Data protection (NDPA 2023 and GDPR)

Built in:

- **Settings → Privacy & data** (every member): download a complete JSON copy of the business (owner) or of your own data; delete the business (owner, typed confirmation, 30-day grace period, cancellable); delete your own login.
- A business waiting for deletion can't send documents. The daily job (`/api/cron/reconcile`) permanently removes it after 30 days, logo included. PayTrail keeps only the record of plan payments made to it, with the business name, for tax.
- Public pages: `/privacy`, `/terms`, `/dpa` (Data Processing Agreement, covering businesses' customer data) and `/subprocessors`. Keep `/subprocessors` current (`subprocessors()` in `lib/legal.js`).

Your side (not code): register with the Nigeria Data Protection Commission once you reach the threshold, file the yearly compliance audit return, name a Data Protection Officer if required, accept Supabase's and Vercel's DPAs in their dashboards, and keep a one-page breach plan (tell affected businesses within 48 hours, the regulator within 72). If you actively market to the EU or UK, appoint a representative there. Have a lawyer review the legal pages.

---

## Documents, templates and printing

- **Templates:** Essential (monochrome, ink-saving), Signature (default; restrained accent colour), Executive (serif, for professional services), POS Compact (thermal receipts).
- **Paper:** A4, US Letter, A5, half letter, and 80 mm / 58 mm receipt rolls. US, Canada and Mexico businesses default to Letter.
- **Defaults** per document type live in **Settings → Documents & printing**. Any document can be changed from its page (**Customise**).
- **Frozen branding:** when a document is issued, the business details, logo, colour and bank details are saved with it. Later changes to the business never alter documents already sent. Changing an issued document's template is allowed, and it's logged.
- **One set of rules everywhere:** the live preview, browser printing (`/print/...`, `/d/[token]/print`, `/r/[token]/print`) and the PDF download follow the same template rules and paper sizes. Thermal rolls print as one page exactly as long as the receipt. In the print dialog choose the receipt printer, margins "None" and scale 100%.
- Fonts: Lato and Source Serif 4 (open licences) in `assets/fonts` (PDF) and `public/fonts` (screen and print).

## Security codes and admin alerts

- New users confirm their email with a **6-digit code** (sent by Supabase through Brevo).
- **Changing payment keys** (any provider, including PayTrail's own billing keys) and **changing bank details** needs a fresh 6-digit code emailed to the person making the change. A correct code allows changes for 10 minutes. Bank details are also enforced in the database.
- **Admin alerts** go by email to `ADMIN_ALERT_EMAILS` (or every platform admin) when a business finishes sign-up, and when payment keys are connected, changed or removed. Keys themselves are never emailed.

## Install and offline (PWA)

- PayTrail can be installed from the browser. On phones a pop-up offers it: Android/Chrome uses the browser's install prompt, and iPhone Safari shows the "Share → Add to Home Screen" steps. If dismissed, it stays hidden for 14 days.
- **Offline:** pages you've opened stay readable offline, and other pages show `/offline` with links to the saved ones. Creating, sending and payments need a connection. Signing out clears saved pages from the device. The service worker (`public/sw.js`) only runs in production builds.

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
npm run test:db   # 18 database security tests (needs a local PostgreSQL 16; see scripts/test-db.sh)
```

## Folder map

```
app/            pages and server actions (app/app = signed-in app, app/admin = platform owner, app/d + app/r = customer links)
components/     design-system components (ui.js), app shell, editor, document view
lib/            Supabase clients, permissions, money, PDFs, email, payments (stripe, paystack, flutterwave, bachs, webhooks)
supabase/       migration (schema + security) and database tests
assets/fonts/   Lato (open licence) for PDFs, which includes the ₦ sign
```
