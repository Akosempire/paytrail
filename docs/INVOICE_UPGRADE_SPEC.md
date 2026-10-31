# Build prompt: Invoice app with the Ledger Design System

You are a senior product designer and full-stack engineer. Design and build a web-based invoicing app for freelancers and small businesses, with Nigeria as the first market and support for other currencies. The app must take a user from a blank invoice to a sent, tracked and paid invoice. The target is under 60 seconds for any invoice after the first. Build everything with the **Ledger Design System** defined at the end of this prompt.

---

## 1. Product goal

Most invoice generators stop at "Download PDF". This app has to cover the whole job:

1. **Create:** a fast builder with a live preview and smart defaults.
2. **Send:** by email, WhatsApp, shareable link, QR code or PDF. Every channel must work.
3. **Track:** Draft → Sent → Viewed → Paid, plus Overdue and Partially paid.
4. **Get paid:** bank details on every invoice, an optional Pay now link, automatic reminders and automatic receipts.

## 2. UX principles (apply to every screen)

1. **The invoice is the interface.** Clicking any part of the live preview (bill-to, a line item, the totals, the payment block) opens that field for editing in place. The side panel is for options, not the only way in.
2. **Set up once, never again.** After onboarding, "New invoice" opens straight on the builder with the sender's details, payment terms, currency and last-used template already applied. Never send users back through setup.
3. **Always show what's missing.** Never disable a button without saying why. The Send button names the missing step ("Add a client to send"), and clicking it scrolls to and focuses that field.
4. **Smart defaults over fields.** Currency comes from the country (NGN for Nigeria). The due date comes from payment terms (for example Net 14). Invoice numbers increase in sequence from a saved prefix (INV-0042). Suggest the client's previous items.
5. **Never lose work.** Autosave every change and show "Saving…" then "Saved" in the header. Every delete has an Undo toast instead of a confirm dialog.
6. **Make sending feel safe.** Before anything goes out, show exactly what the client will receive: the email and the invoice page.
7. **Keep working after the send.** Track status, alert the user when the invoice is viewed, send reminders automatically, and record payments.

## 3. Information architecture

- **Desktop:** left sidebar navigation (Invoices, Clients, Products, Settings) and a primary "New invoice" button.
- **Mobile:** bottom tab bar (Invoices · Clients · + · Settings).
- Routes: `/invoices`, `/invoices/new`, `/invoices/:id`, `/invoices/:id/edit`, `/clients`, `/clients/:id`, `/products`, `/settings` (profile, payment methods, branding, reminders, numbering), `/i/:publicToken` (public page the client sees).

## 4. Screens

### 4.1 Onboarding (first run only, about 3 short steps, all skippable)

1. **About you:** Personal or Business card toggle; name, email, phone with country code, address (street, city, state, postcode), tax ID (optional), and logo upload with a drag-and-drop zone that shows the logo straight away.
2. **Getting paid:** add a bank account (bank name from a searchable list of Nigerian banks, account number, account name). Optionally connect a payment provider (Paystack or Flutterwave for NGN, Stripe for GBP/USD/EUR).
3. **Defaults:** currency (preselected from the country), payment terms (On receipt / 7 / 14 / 30 days), invoice prefix and starting number, brand colour.

Show a live mini preview of the invoice updating as they fill each step. End with "You're set. Create your first invoice".

### 4.2 Invoice builder (desktop layout)

- **Top bar:** breadcrumb "Invoices / INV-0042", save status ("Draft · Saved"), and a preview mode toggle (Desktop · Phone · PDF).
- **Left area (about 60% of the width):** a template swatch row above a live invoice preview, which is fully editable in place.
  - Template row: 4–6 layout thumbnails with descriptive names (Classic, Bold header, Minimal, Compact) plus a brand-colour dot. Hovering a thumbnail previews it on the invoice; clicking applies it.
  - Empty required areas show a soft dashed outline in the accent colour with a label such as "+ Add client". Never use grey skeleton bars for empty fields.
- **Right panel (about 40%):** a collapsible outline. Each row shows a summary value:
  - Client: "Not set" in warning colour until chosen
  - Details: "INV-0042 · NGN"
  - Items: "3 items"
  - Totals: "₦300,000"
  - Payment: "GTBank"
  - Notes: "Optional"
- **Sticky footer** inside the right panel: the missing-step hint ("Add a client to send"), the total due, and a primary **Send invoice** button. A secondary menu holds Save as draft, Download PDF and Preview as client.

### 4.3 Builder interactions

| Element | Behaviour |
| --- | --- |
| Client | Type to search; recent clients first. If nothing matches, the last row reads "+ Add 'Ade Foods' as a new client" and creates it inline with just name and email. The client chip shows any unpaid balance ("Owes ₦120,000"). |
| Line items | Fields: name, optional description, qty, unit, price, optional per-line discount. Enter adds a row; Tab moves between fields. Typing a name suggests saved products and fills in the price. Qty accepts simple maths ("3*8"). Row totals update with a subtle animation. Drag handle appears on hover. Delete shows "Item removed · Undo". |
| Amounts | Format as you type (150000 → 150,000.00), with the currency symbol inside the field. Use tabular numerals. When the currency changes, ask once whether to keep or convert existing prices. |
| Totals | Subtotal and total always show. Discount, tax (% or flat), shipping and deposit / amount paid stay hidden behind "+ Add discount / tax / shipping" links until used. Balance due is calculated automatically. |
| Dates | Show the due date as a sentence ("Due in 14 days · Fri 14 Nov"). Clicking opens a popover with chips (On receipt, 7, 14, 30 days) above a full calendar. Past dates are allowed, and the popover always stays on screen. |
| Invoice number | Prefilled with the next number in sequence and editable. A duplicate number gets an inline warning but doesn't block saving. |
| PO number | Optional, with a short tooltip explaining what it is. |
| Payment block | Defaults to the saved bank account, plus a Pay now link if a provider is connected. Can be switched per invoice. |
| Notes / terms | A free-text field that can be saved as a default. |

### 4.4 Send sheet

Clicking **Send invoice** opens a side sheet (a full-screen sheet on mobile):

- Channel tabs: **Email · WhatsApp · Link · QR · PDF**.
- **Email:** To (prefilled), CC, Subject ("Invoice INV-0042 from Akorede Studio"), and Message (from a saved template with variables for client name, amount, due date and link). PDF attachment on/off. A live preview of the email sits on the right.
- **WhatsApp:** a prefilled message with the public invoice link, opened via `wa.me` or the Web Share API.
- **Link:** a copy button with a "Copied" confirmation.
- **QR:** shows the QR code with a Download PNG button.
- **PDF:** downloads the server-rendered PDF.
- Actions: "Send now" or "Schedule…", plus "Make recurring" (weekly or monthly).
- After sending, show a toast: "Sent to ade@adefoods.ng · Undo". The email waits 10 seconds before it actually goes. Then open the invoice detail page.

### 4.5 Invoice detail

- Header: invoice number, client, amount, and a status pill (always a word plus a colour, never colour alone).
- Status banner where relevant, for example (amber): "5 days overdue. Next reminder goes Tue 18 Nov. Send now · Edit reminders".
- Activity timeline: Created → Sent (channel) → Viewed ("Ade Foods opened this · 2 min ago") → Reminder sent → Payment recorded → Paid.
- Actions: Record payment (full or partial; amount, date, method, reference), Send reminder, Duplicate, Edit, Void, Download PDF, Copy link.
- When an invoice is marked Paid: a single confetti burst (skipped under reduced motion) and "Receipt sent to Ade Foods".

### 4.6 Invoice list (home)

- Summary cards: Outstanding, Overdue, Paid this month (in the default currency).
- Filter chips: All · Draft · Sent · Viewed · Overdue · Paid. Plus search by client, number or amount.
- Table on desktop and cards on mobile, with columns: number, client, issue date, due date, amount, status. Swipe or ⋯ menu for quick actions.

### 4.7 Public client page (`/i/:token`)

- Branded invoice in the chosen template, readable on a phone.
- Bank details with a copy button on each field, a **Pay now** button when a provider is connected, and Download PDF.
- Opening the page records a Viewed event.
- When paid: "Paid on 14 Nov. Thank you." and Download receipt.

### 4.8 Clients, Products, Settings

- **Clients:** list with outstanding balance; detail page with contact info, tags and invoice history.
- **Products:** saved items with name, description, unit, price and tax rate.
- **Settings:** profile, branding (logo, colour, font, default template), payment methods, invoice numbering, default terms and notes, email templates, and reminder rules (for example 3 days before, on the due date, 7 days after; each can be switched on or off and edited).

## 5. States and microcopy

Tone: plain and friendly, no jargon, no exclamation marks except when an invoice is paid. Say "client" rather than "customer" and "Send" rather than "Create".

| Where | State | Copy and behaviour |
| --- | --- | --- |
| Invoice list | Empty | "No invoices yet. Your first one takes about a minute." [Create invoice] |
| Invoice list | No filter results | "No overdue invoices. Nice." [Clear filter] |
| Any list | Loading | Skeleton rows that match the real layout; never a full-page spinner |
| Builder | Autosave | "Saving…" → "Saved"; offline: "Offline · changes will sync" |
| Builder | Missing field | Button reads "Add a client to send"; red outline only after the user tries to send |
| Email field | Invalid (on blur) | "That email doesn't look right. Check for a typo." |
| Email field | Likely typo | "Did you mean ade@gmail.com?" with a one-click fix |
| New client | Header | "New client" / "Saved to your clients so you can bill them again." |
| Edit client | Header | "Edit client" / "Changes apply to future invoices for this client." |
| Line item | Deleted | "Item removed · Undo" |
| Send | In progress | Button spinner + "Sending…", form locked |
| Send | Success | "Sent to ade@adefoods.ng · Undo" |
| Send | Failure | "We couldn't send this email. The address may not exist." [Edit address] [Copy link instead] |
| Paid-only feature | Locked | Never a silent lock icon. Tooltip: "Payment links are on Pro." [Upgrade] |

## 6. Mobile, keyboard and accessibility

- **Mobile (under 768px):** the builder becomes a single form with a sticky footer (total + Send). A "Preview" button opens the invoice in a full-screen sheet. Use `inputmode="decimal"` for amounts and `type="email"` for emails. Tap targets at least 44 × 44px. Swipe actions on rows. The Web Share API opens the native share sheet.
- **Keyboard:** `N` new invoice, `/` search, `Cmd/Ctrl + Enter` send, `Cmd/Ctrl + K` command menu. Logical tab order. Escape closes every popover, dropdown and sheet.
- **Accessibility (WCAG 2.2 AA):** text contrast at least 4.5:1 in both themes. Every icon-only button has an `aria-label`. Errors are announced with `aria-live` and linked to their field with `aria-describedby`. Visible focus rings. One `h1` per page. Status always uses a word plus a colour. Respect `prefers-reduced-motion`.

## 7. Data model

- **Workspace:** id, type (personal | business), name, email, phone, address, tax_id, logo_url, brand_color, font, default_template, default_currency, payment_terms_days, invoice_prefix, next_invoice_seq
- **PaymentMethod:** id, workspace_id, kind (bank | paystack | flutterwave | stripe), bank_name, account_name, account_number, is_default
- **Client:** id, workspace_id, name, email, cc_emails[], phone, address, tags[], notes
- **Product:** id, workspace_id, name, description, unit, unit_price, tax_rate
- **Invoice:** id, workspace_id, client_id, number, po_number, currency, template_id, issue_date, due_date, status (draft | sent | viewed | partially_paid | paid | overdue | void), subtotal, discount, tax, shipping, amount_paid, total, balance_due, notes, public_token, sent_at, viewed_at, paid_at, recurring_rule
- **InvoiceItem:** id, invoice_id, position, name, description, qty, unit, unit_price, discount, tax_rate, line_total
- **Payment:** id, invoice_id, amount, method, reference, paid_at
- **InvoiceEvent:** id, invoice_id, type (created | sent | viewed | reminder | payment | paid | voided), channel, meta, created_at
- **ReminderRule:** id, workspace_id, offset_days, email_template, enabled

Status changes only through events. A daily job marks unpaid invoices overdue once their due date has passed and sends any reminders that are due. Totals are always recalculated on the server.

## 8. API

- `POST /invoices` · `PATCH /invoices/:id` (autosave) · `POST /invoices/:id/duplicate` · `POST /invoices/:id/void`
- `POST /invoices/:id/send` with `{ channel, to, cc, subject, message, attachPdf, scheduledAt }`
- `GET /invoices/:id/pdf` (server-rendered from the same template components as the preview)
- `GET /i/:token` (public page; logs a viewed event)
- `POST /invoices/:id/payments` · `POST /webhooks/paystack` · `POST /webhooks/flutterwave` · `POST /webhooks/stripe`
- CRUD for `/clients`, `/products`, `/payment-methods`, `/reminder-rules`

## 9. Suggested stack

Next.js (App Router) + TypeScript, Tailwind CSS mapped to Ledger tokens, Radix UI primitives, React Hook Form + Zod, and TanStack Query. Supabase (Postgres, auth with magic link and Google, storage for logos). Resend or Postmark for email from a verified domain. React-PDF or Playwright for PDFs. Paystack, Flutterwave and Stripe for payments. A scheduled job for overdue status and reminders.

## 10. Build order

1. **Send and save:** auth, database, builder with autosave, email send, public link, QR, PDF, bank details, NGN default, payment-terms due dates.
2. **Get paid:** statuses, invoice list and dashboard, manual and partial payments, pay links with webhooks, reminders, receipts.
3. **Work faster:** product catalogue, discounts, shipping, deposits, duplicate and recurring invoices, WhatsApp, branding controls, scheduled sends.
4. **Grow:** quotes that convert to invoices, client portal, reports, teammates and roles, accounting export.

---

## Ledger Design System

A calm, premium, dark-first system that also works in light mode. Money and status must always be readable at a glance.

### Colour tokens

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `bg` | #0E0E10 | #FAFAF9 | App background |
| `surface` | #17171A | #FFFFFF | Panels, cards |
| `surface-raised` | #1F1F23 | #F4F4F5 | Inputs, hovered rows, popovers |
| `border` | #2A2A30 | #E4E4E7 | Dividers, input borders |
| `text` | #F4F4F5 | #18181B | Primary text |
| `text-muted` | #A1A1AA | #52525B | Labels, secondary text (at least 4.5:1) |
| `accent` | #4F8CFF | #2563EB | Primary actions, focus, selection |
| `accent-soft` | accent at 12% | accent at 10% | Selected backgrounds, empty-field outlines |
| `success` | #22C55E | #16A34A | Paid |
| `warning` | #F5A524 | #D97706 | Overdue, missing info |
| `danger` | #F04438 | #DC2626 | Errors, void |
| `info` | #38BDF8 | #0284C7 | Viewed |

Status pills: Draft (neutral) · Sent (accent) · Viewed (info) · Partially paid (warning, outlined) · Overdue (warning) · Paid (success) · Void (danger, struck through). Each pill pairs a 12% tinted background with full-strength text.

The **invoice document itself** always renders on white (#FFFFFF) with near-black text, so it prints and exports correctly. The brand colour only tints the header, accent rule and totals.

### Typography

- Font: **Inter** (fallback: system-ui). Turn on tabular numerals (`font-variant-numeric: tabular-nums`) for every amount.
- Scale: Display 64/72 (invoice wordmark) · H1 28/36 · H2 20/28 · H3 16/24 semibold · Body 14/22 · Small 13/20 · Caption 12/16 · Overline 11/16 uppercase, +0.06em tracking.
- Weights: 400 body, 500 labels and buttons, 600 headings and totals.

### Spacing, radius, elevation

- 4px base unit: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 6 (inputs, chips) · 8 (buttons) · 12 (cards, panels) · 16 (sheets) · 999 (pills, avatars).
- Elevation: borders do most of the work in dark mode. Popovers and sheets get `0 8px 24px rgba(0,0,0,0.32)` (dark) or `rgba(0,0,0,0.08)` (light).
- Layout: desktop builder max width 1440px with a 24px gutter; mobile has 16px side padding.

### Motion

- 150ms for hover and press, 200ms for popovers, 250ms for sheets. Easing `cubic-bezier(0.2, 0, 0, 1)`.
- Number changes (totals) count up over 200ms. A single confetti burst on Paid.
- All motion is disabled under `prefers-reduced-motion`.

### Components

- **Button:** Primary (accent fill), Secondary (surface-raised), Ghost, Destructive. Sizes 32, 40 and 48px. Loading state keeps the button's width. Icon-only buttons need an `aria-label` and a tooltip.
- **Input:** 40px tall with the label above, never a placeholder used as the label. Helper text below; the error state has a red border and an icon plus message. Prefix/suffix slots for currency and %.
- **Combobox:** searchable, keyboard navigable, with an "Add new…" last row. Escape closes it.
- **Segmented control:** for %/flat toggles and preview modes.
- **Selectable card:** for Personal/Business with a check badge.
- **Date popover:** quick chips above the calendar, collision-aware placement.
- **Line-item row:** drag handle, name/qty/price fields, inline total, overflow menu.
- **Status pill, Avatar (initials with a deterministic colour), Client chip (with balance), Toast (with action), Banner (info/warning/danger), Side sheet, Modal (rarely used), Tooltip, Skeleton, Empty state (icon + one line + one action), Tabs, Table, Mobile bottom bar.**
- **Focus:** 2px accent ring with a 2px offset on every interactive element.

### Iconography

Lucide icons, 1.5px stroke, 16px inline and 20px in navigation, always paired with a text label or an `aria-label`.

---

**Deliverables:** responsive screens for every view above in dark and light themes, a working front end wired to the API, and Ledger tokens exported as CSS variables and a Tailwind theme.