-- =====================================================================
-- PayTrail — quotations, invoices and receipts for many businesses.
--
-- Every business row owns its own customers, documents, costs, payments
-- and receipts. Row-level security keeps each business inside its own
-- data; hidden cost lines get a stricter rule of their own so a member
-- who is not allowed to see costs never receives them, even via the API.
--
-- Money is stored in minor units (kobo, cents) as bigint.
-- Safe to run on a fresh Supabase project from the SQL editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Platform (the PayTrail owner)
-- ---------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- one row only: the trial rules and how PayTrail collects its own subscriptions
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  trial_mode text not null default 'documents' check (trial_mode in ('documents','days','none')),
  trial_documents integer not null default 2 check (trial_documents >= 0),
  trial_days integer not null default 14 check (trial_days >= 0),
  billing_provider text not null default 'manual' check (billing_provider in ('manual','bachs','flutterwave')),
  billing_secret_enc text,
  billing_webhook_secret_enc text,
  billing_key_hint text not null default '',
  support_email text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings(id) values (true) on conflict do nothing;

-- pricing lives here and is edited by the platform owner, never hardcoded
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  tagline text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  billing_interval text not null default 'month' check (billing_interval in ('month','year')),
  document_limit integer check (document_limit is null or document_limit >= 0), -- per month; null = unlimited
  seat_limit integer check (seat_limit is null or seat_limit >= 1),            -- team members; null = unlimited
  allow_company boolean not null default true,
  features text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Businesses, people and roles
-- ---------------------------------------------------------------------

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('freelancer','company')),
  name text not null check (char_length(name) between 1 and 120),
  legal_name text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default 'Nigeria',
  tax_id text not null default '',
  logo_path text,
  brand_color text not null default '#1570EF' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  tax_label text not null default 'VAT',
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  quote_prefix text not null default 'QT' check (quote_prefix ~ '^[A-Za-z0-9]{1,8}$'),
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Za-z0-9]{1,8}$'),
  receipt_prefix text not null default 'RCT' check (receipt_prefix ~ '^[A-Za-z0-9]{1,8}$'),
  quote_seq integer not null default 0,
  invoice_seq integer not null default 0,
  receipt_seq integer not null default 0,
  quote_validity_days integer not null default 14 check (quote_validity_days between 1 and 365),
  invoice_due_days integer not null default 7 check (invoice_due_days between 0 and 365),
  default_terms text not null default '',
  footer_note text not null default '',
  bank_name text not null default '',
  bank_account_name text not null default '',
  bank_account_number text not null default '',
  require_approval boolean not null default true, -- junior finance drafts need sign-off
  plan_id uuid references public.plans(id) on delete set null,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled','suspended')),
  trial_documents_used integer not null default 0,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  onboarded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  active_business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','finance','junior_finance')),
  can_view_costs boolean not null default true,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('manager','finance','junior_finance')),
  can_view_costs boolean not null default false,
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_business_idx on public.invitations(business_id, created_at desc);

-- ---------------------------------------------------------------------
-- Customers and documents
-- ---------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_business_idx on public.customers(business_id, name);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('quote','invoice')),
  number text not null,
  title text not null default '',
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null default '',
  customer_company text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  customer_address text not null default '',
  currency text not null check (char_length(currency) = 3),
  status text not null default 'draft' check (status in
    ('draft','pending_approval','sent','viewed','accepted','declined','partially_paid','paid','void')),
  issue_date date not null default current_date,
  due_date date,
  valid_until date,
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  tax_label text not null default '',
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  amount_paid_minor bigint not null default 0 check (amount_paid_minor >= 0),
  notes text not null default '',
  terms text not null default '',
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  source_quote_id uuid references public.documents(id) on delete set null,
  converted_invoice_id uuid references public.documents(id) on delete set null,
  counted_toward_allowance boolean not null default false,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_name text not null default '',
  declined_at timestamptz,
  decline_reason text not null default '',
  paid_at timestamptz,
  voided_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number)
);
create index if not exists documents_business_idx on public.documents(business_id, kind, created_at desc);
create index if not exists documents_customer_idx on public.documents(customer_id);

-- what the customer sees
create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 300),
  details text not null default '',
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  sort_order integer not null default 0
);
create index if not exists document_items_doc_idx on public.document_items(document_id, sort_order);

-- what only the business sees: its own cost of doing the job
create table if not exists public.document_costs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  category text not null default 'other' check (category in
    ('data','electricity','subscription','transport','labour','materials','fees','other')),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  note text not null default '',
  sort_order integer not null default 0
);
create index if not exists document_costs_doc_idx on public.document_costs(document_id, sort_order);

-- reusable cost templates, e.g. "Monthly data — ₦15,000"
create table if not exists public.cost_presets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  category text not null default 'other' check (category in
    ('data','electricity','subscription','transport','labour','materials','fees','other')),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------

create table if not exists public.payment_connections (
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('bachs','flutterwave')),
  mode text not null default 'test' check (mode in ('test','live')),
  secret_key_enc text,
  webhook_secret_enc text,
  key_hint text not null default '',
  enabled boolean not null default true,
  payment_confirmed_at timestamptz,  -- a test payment completed at the provider
  webhook_confirmed_at timestamptz,  -- the provider reached our webhook
  last_test_reference text,
  last_error text not null default '',
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, provider)
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  provider text not null check (provider in ('bachs','flutterwave')),
  purpose text not null check (purpose in ('document','connection_test','subscription')),
  reference text not null unique,
  provider_checkout_id text,
  checkout_url text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  plan_id uuid references public.plans(id) on delete set null,
  mode text not null default 'live' check (mode in ('test','live')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  provider_reference text,
  failure_reason text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists payment_attempts_doc_idx on public.payment_attempts(document_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  method text not null check (method in ('bachs','flutterwave','bank_transfer','cash','pos','other')),
  reference text not null default '',
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  paid_at timestamptz not null default now(),
  note text not null default '',
  attempt_id uuid unique references public.payment_attempts(id) on delete set null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_business_idx on public.payments(business_id, paid_at desc);
create index if not exists payments_document_idx on public.payments(document_id);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  number text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  balance_after_minor bigint not null default 0,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  issued_at timestamptz not null default now(),
  unique (business_id, number)
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  business_id uuid references public.businesses(id) on delete cascade,
  event_type text not null default '',
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  method text not null,
  reference text not null default '',
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text not null default '',
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_business_idx on public.activity(business_id, created_at desc);

-- ---------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies can read memberships
-- without recursing through memberships' own policy.
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.member_role(target uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.memberships where business_id = target and user_id = auth.uid();
$$;

create or replace function public.is_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where business_id = target and user_id = auth.uid());
$$;

create or replace function public.has_role(target uuid, allowed text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(target) = any(allowed), false);
$$;

create or replace function public.can_view_costs(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where business_id = target and user_id = auth.uid()
    and (role in ('owner','manager') or can_view_costs));
$$;

-- ---------------------------------------------------------------------
-- Allowance: trial and plan limits, enforced when a document is sent
-- ---------------------------------------------------------------------

create or replace function public.business_allowance(target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  s public.platform_settings%rowtype;
  p public.plans%rowtype;
  used integer;
begin
  select * into b from public.businesses where id = target;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'not_found'); end if;
  if (auth.uid() is null and coalesce(current_setting('request.jwt.claim.role', true), '') = 'anon')
     or (auth.uid() is not null and not public.is_member(target) and not public.is_platform_admin()) then
    return jsonb_build_object('allowed', false, 'reason', 'forbidden');
  end if;
  select * into s from public.platform_settings where id;
  if b.subscription_status = 'suspended' then
    return jsonb_build_object('allowed', false, 'reason', 'suspended');
  end if;
  if b.subscription_status = 'active' and (b.current_period_end is null or b.current_period_end > now()) then
    select * into p from public.plans where id = b.plan_id;
    if p.id is null or p.document_limit is null then
      return jsonb_build_object('allowed', true, 'reason', 'plan', 'limit', null);
    end if;
    select count(*) into used from public.documents
      where business_id = target and counted_toward_allowance and sent_at >= date_trunc('month', now());
    return jsonb_build_object('allowed', used < p.document_limit, 'reason', case when used < p.document_limit then 'plan' else 'plan_limit' end,
      'used', used, 'limit', p.document_limit);
  end if;
  if b.subscription_status = 'trialing' then
    if s.trial_mode = 'documents' then
      return jsonb_build_object('allowed', b.trial_documents_used < s.trial_documents,
        'reason', case when b.trial_documents_used < s.trial_documents then 'trial' else 'trial_used' end,
        'used', b.trial_documents_used, 'limit', s.trial_documents, 'mode', 'documents');
    elsif s.trial_mode = 'days' then
      return jsonb_build_object('allowed', coalesce(b.trial_ends_at > now(), false),
        'reason', case when coalesce(b.trial_ends_at > now(), false) then 'trial' else 'trial_used' end,
        'ends_at', b.trial_ends_at, 'mode', 'days');
    end if;
    return jsonb_build_object('allowed', false, 'reason', 'trial_used', 'mode', 'none');
  end if;
  return jsonb_build_object('allowed', false, 'reason', 'subscription_required');
end; $$;

-- ---------------------------------------------------------------------
-- Onboarding: create a business with its owner in one step
-- ---------------------------------------------------------------------

create or replace function public.create_business(
  business_kind text, business_name text, owner_name text, business_currency text default 'NGN'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  s public.platform_settings%rowtype;
  me uuid := auth.uid();
  my_email text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if business_kind not in ('freelancer','company') then raise exception 'Choose freelancer or company'; end if;
  if char_length(trim(coalesce(business_name,''))) = 0 then raise exception 'Business name is required'; end if;
  select * into s from public.platform_settings where id;
  select email into my_email from auth.users where id = me;
  insert into public.businesses(kind, name, email, currency, created_by, trial_ends_at)
    values (business_kind, trim(business_name), coalesce(my_email,''), upper(coalesce(business_currency,'NGN')), me,
      case when s.trial_mode = 'days' then now() + make_interval(days => s.trial_days) end)
    returning id into new_id;
  insert into public.memberships(business_id, user_id, role, can_view_costs, full_name, email)
    values (new_id, me, 'owner', true, coalesce(owner_name,''), coalesce(my_email,''));
  insert into public.profiles(user_id, full_name, active_business_id) values (me, coalesce(owner_name,''), new_id)
    on conflict (user_id) do update set active_business_id = excluded.active_business_id,
      full_name = case when excluded.full_name <> '' then excluded.full_name else profiles.full_name end;
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (new_id, me, coalesce(nullif(owner_name,''), my_email, ''), 'business.created', jsonb_build_object('kind', business_kind));
  return new_id;
end; $$;

-- ---------------------------------------------------------------------
-- Numbering: sequential per business, per document type
-- ---------------------------------------------------------------------

create or replace function public.next_document_number(target uuid, doc_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  seq integer;
  prefix text;
begin
  if doc_kind = 'quote' then
    update public.businesses set quote_seq = quote_seq + 1 where id = target returning * into b;
    seq := b.quote_seq; prefix := b.quote_prefix;
  elsif doc_kind = 'invoice' then
    update public.businesses set invoice_seq = invoice_seq + 1 where id = target returning * into b;
    seq := b.invoice_seq; prefix := b.invoice_prefix;
  else
    update public.businesses set receipt_seq = receipt_seq + 1 where id = target returning * into b;
    seq := b.receipt_seq; prefix := b.receipt_prefix;
  end if;
  if not found then raise exception 'Business not found'; end if;
  return prefix || '-' || lpad(seq::text, 4, '0');
end; $$;
revoke all on function public.next_document_number(uuid, text) from public, anon, authenticated;

-- totals are always recomputed in the database from the line items
create or replace function public.recalculate_document(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  sub bigint;
  taxable bigint;
  tax bigint;
begin
  select * into d from public.documents where id = target for update;
  if not found then return; end if;
  select coalesce(sum(round(quantity * unit_price_minor)), 0)::bigint into sub from public.document_items where document_id = target;
  taxable := greatest(sub - least(d.discount_minor, sub), 0);
  tax := round(taxable * d.tax_rate / 100)::bigint;
  update public.documents set subtotal_minor = sub, discount_minor = least(d.discount_minor, sub),
    tax_minor = tax, total_minor = taxable + tax, updated_at = now() where id = target;
end; $$;
revoke all on function public.recalculate_document(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Saving a document with its lines and hidden costs in one transaction
-- payload: { kind, title, customer_id, customer:{name,company,email,phone,address},
--   issue_date, due_date, valid_until, discount_minor, tax_rate, tax_label,
--   notes, terms, items:[{description,details,quantity,unit_price_minor}],
--   costs:[{label,category,amount_minor,note}] }
-- ---------------------------------------------------------------------

create or replace function public.save_document(target uuid, doc_id uuid, payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_role text := public.member_role(target);
  b public.businesses%rowtype;
  d public.documents%rowtype;
  cust public.customers%rowtype;
  doc_kind text := coalesce(payload->>'kind', 'quote');
  item jsonb;
  cost jsonb;
  i integer := 0;
  costs_visible boolean := public.can_view_costs(target);
begin
  if my_role is null then raise exception 'You are not a member of this business'; end if;
  select * into b from public.businesses where id = target;
  if doc_id is not null then
    select * into d from public.documents where id = doc_id and business_id = target for update;
    if not found then raise exception 'Document not found'; end if;
    if d.status not in ('draft','pending_approval') then raise exception 'Only drafts can be edited. Duplicate it to make changes.'; end if;
    doc_kind := d.kind;
  end if;
  if doc_kind not in ('quote','invoice') then raise exception 'Unknown document type'; end if;

  if nullif(payload->>'customer_id','') is not null then
    select * into cust from public.customers where id = (payload->>'customer_id')::uuid and business_id = target;
    if not found then raise exception 'Customer not found'; end if;
  elsif char_length(trim(coalesce(payload->'customer'->>'name',''))) > 0 then
    insert into public.customers(business_id, name, company, email, phone, address)
      values (target, trim(payload->'customer'->>'name'), coalesce(payload->'customer'->>'company',''),
        lower(coalesce(payload->'customer'->>'email','')), coalesce(payload->'customer'->>'phone',''),
        coalesce(payload->'customer'->>'address',''))
      returning * into cust;
  end if;

  if doc_id is null then
    insert into public.documents(business_id, kind, number, currency, tax_label, tax_rate, terms, created_by,
        issue_date, due_date, valid_until)
      values (target, doc_kind, public.next_document_number(target, doc_kind), b.currency, b.tax_label, b.tax_rate,
        b.default_terms, me, current_date,
        case when doc_kind = 'invoice' then current_date + b.invoice_due_days end,
        case when doc_kind = 'quote' then current_date + b.quote_validity_days end)
      returning * into d;
  end if;

  -- the customer only changes when the payload says so
  if payload ? 'customer_id' or payload ? 'customer' then
    update public.documents set customer_id = cust.id, customer_name = coalesce(cust.name, ''),
      customer_company = coalesce(cust.company, ''), customer_email = coalesce(cust.email, ''),
      customer_phone = coalesce(cust.phone, ''), customer_address = coalesce(cust.address, '')
    where id = d.id;
  end if;

  update public.documents set
    title = coalesce(payload->>'title', title),
    issue_date = coalesce(nullif(payload->>'issue_date','')::date, issue_date),
    due_date = case when payload ? 'due_date' then nullif(payload->>'due_date','')::date else due_date end,
    valid_until = case when payload ? 'valid_until' then nullif(payload->>'valid_until','')::date else valid_until end,
    discount_minor = greatest(coalesce((payload->>'discount_minor')::bigint, discount_minor), 0),
    tax_rate = coalesce((payload->>'tax_rate')::numeric, tax_rate),
    tax_label = coalesce(payload->>'tax_label', tax_label),
    notes = coalesce(payload->>'notes', notes),
    terms = coalesce(payload->>'terms', terms),
    -- an edit by junior finance always goes back for approval
    status = case when my_role = 'junior_finance' and status = 'pending_approval' then 'draft' else status end,
    updated_at = now()
  where id = d.id;

  if payload ? 'items' then
    delete from public.document_items where document_id = d.id;
    for item in select * from jsonb_array_elements(payload->'items') loop
      if char_length(trim(coalesce(item->>'description',''))) > 0 then
        insert into public.document_items(document_id, business_id, description, details, quantity, unit_price_minor, sort_order)
          values (d.id, target, trim(item->>'description'), coalesce(item->>'details',''),
            greatest(coalesce((item->>'quantity')::numeric, 1), 0.01),
            greatest(coalesce((item->>'unit_price_minor')::bigint, 0), 0), i);
        i := i + 1;
      end if;
    end loop;
  end if;

  -- members who cannot see costs cannot overwrite them either
  if payload ? 'costs' and costs_visible then
    delete from public.document_costs where document_id = d.id;
    i := 0;
    for cost in select * from jsonb_array_elements(payload->'costs') loop
      if char_length(trim(coalesce(cost->>'label',''))) > 0 then
        insert into public.document_costs(document_id, business_id, label, category, amount_minor, note, sort_order)
          values (d.id, target, trim(cost->>'label'),
            case when cost->>'category' in ('data','electricity','subscription','transport','labour','materials','fees','other') then cost->>'category' else 'other' end,
            greatest(coalesce((cost->>'amount_minor')::bigint, 0), 0), coalesce(cost->>'note',''), i);
        i := i + 1;
      end if;
    end loop;
  end if;

  perform public.recalculate_document(d.id);
  insert into public.activity(business_id, document_id, actor_id, actor_label, action)
    values (target, d.id, me, (select coalesce(nullif(full_name,''), email) from public.memberships where business_id = target and user_id = me),
      case when doc_id is null then 'document.created' else 'document.updated' end);
  return d.id;
end; $$;
revoke all on function public.save_document(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_document(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Workflow: submit, approve, send, void, convert
-- ---------------------------------------------------------------------

create or replace function public.actor_label(target uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(full_name,''), email) from public.memberships where business_id = target and user_id = auth.uid()), 'PayTrail');
$$;

create or replace function public.submit_document(doc_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or not public.is_member(d.business_id) then raise exception 'Document not found'; end if;
  if d.status <> 'draft' then raise exception 'Only drafts can be submitted'; end if;
  if d.total_minor <= 0 then raise exception 'Add at least one priced item first'; end if;
  update public.documents set status = 'pending_approval', submitted_by = auth.uid(), updated_at = now() where id = doc_id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action)
    values (d.business_id, doc_id, auth.uid(), public.actor_label(d.business_id), 'document.submitted');
end; $$;

-- marks a document as sent and counts it against the trial or plan allowance
drop function if exists public.mark_document_sent(uuid);
create or replace function public.mark_document_sent(doc_id uuid, expected_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  b public.businesses%rowtype;
  my_role text;
  allowance jsonb;
  counts boolean;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found then raise exception 'Document not found'; end if;
  my_role := public.member_role(d.business_id);
  if my_role is null then raise exception 'Document not found'; end if;
  select * into b from public.businesses where id = d.business_id for update;
  if my_role = 'junior_finance' and b.require_approval and d.status in ('draft','pending_approval') then
    raise exception 'A manager or finance officer needs to approve this before it is sent';
  end if;
  if d.status = 'void' then raise exception 'This document has been voided'; end if;
  -- the approver must be sending exactly what they looked at
  if expected_updated_at is not null and date_trunc('milliseconds', d.updated_at) <> date_trunc('milliseconds', expected_updated_at) then
    raise exception 'This document changed since you opened it. Refresh and check it again.';
  end if;
  if d.total_minor <= 0 then raise exception 'Add at least one priced item first'; end if;
  if d.customer_name = '' then raise exception 'Choose a customer first'; end if;
  -- an invoice converted from an already-counted quote is not counted twice
  counts := not d.counted_toward_allowance and not exists (
    select 1 from public.documents q where q.id = d.source_quote_id and q.counted_toward_allowance);
  if counts then
    allowance := public.business_allowance(d.business_id);
    if not coalesce((allowance->>'allowed')::boolean, false) then
      raise exception 'ALLOWANCE:%', allowance->>'reason';
    end if;
    if b.subscription_status = 'trialing' then
      update public.businesses set trial_documents_used = trial_documents_used + 1 where id = b.id;
    end if;
  end if;
  update public.documents set
    status = case when status in ('draft','pending_approval') then 'sent' else status end,
    approved_by = case when d.status = 'pending_approval' then auth.uid() else approved_by end,
    approved_at = case when d.status = 'pending_approval' then now() else approved_at end,
    sent_at = coalesce(sent_at, now()),
    counted_toward_allowance = counted_toward_allowance or counts,
    updated_at = now()
  where id = doc_id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action)
    values (d.business_id, doc_id, auth.uid(), public.actor_label(d.business_id),
      case when d.status = 'pending_approval' then 'document.approved_and_sent' else 'document.sent' end);
  return public.business_allowance(d.business_id);
end; $$;

create or replace function public.return_document_to_draft(doc_id uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or not public.has_role(d.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if d.status <> 'pending_approval' then raise exception 'Only documents waiting for approval can be returned'; end if;
  update public.documents set status = 'draft', updated_at = now() where id = doc_id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (d.business_id, doc_id, auth.uid(), public.actor_label(d.business_id), 'document.returned', jsonb_build_object('reason', coalesce(reason,'')));
end; $$;

create or replace function public.void_document(doc_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or not public.has_role(d.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if d.amount_paid_minor > 0 then raise exception 'This document has payments recorded and cannot be voided'; end if;
  update public.documents set status = 'void', voided_at = now(), updated_at = now() where id = doc_id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action)
    values (d.business_id, doc_id, auth.uid(), public.actor_label(d.business_id), 'document.voided');
end; $$;

create or replace function public.delete_draft(doc_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or not public.is_member(d.business_id) then raise exception 'Document not found'; end if;
  if d.status not in ('draft','pending_approval') or d.sent_at is not null then raise exception 'Only unsent drafts can be deleted'; end if;
  if public.member_role(d.business_id) = 'junior_finance' and d.created_by is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  delete from public.documents where id = doc_id;
end; $$;

-- copies items and hidden costs from a quote into a new invoice
create or replace function public.convert_quote_to_invoice(quote_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q public.documents%rowtype;
  b public.businesses%rowtype;
  inv_id uuid;
begin
  select * into q from public.documents where id = quote_id for update;
  if not found or q.kind <> 'quote' or not public.has_role(q.business_id, array['owner','manager','finance']) then
    raise exception 'Not allowed';
  end if;
  if q.converted_invoice_id is not null then return q.converted_invoice_id; end if;
  if q.status in ('void','declined','draft','pending_approval') then raise exception 'Only sent or accepted quotes can become invoices'; end if;
  select * into b from public.businesses where id = q.business_id;
  insert into public.documents(business_id, kind, number, title, customer_id, customer_name, customer_company, customer_email,
      customer_phone, customer_address, currency, status, issue_date, due_date, discount_minor, tax_label, tax_rate,
      notes, terms, source_quote_id, created_by, sent_at, counted_toward_allowance)
    values (q.business_id, 'invoice', public.next_document_number(q.business_id, 'invoice'), q.title, q.customer_id, q.customer_name,
      q.customer_company, q.customer_email, q.customer_phone, q.customer_address, q.currency, 'sent', current_date,
      current_date + b.invoice_due_days, q.discount_minor, q.tax_label, q.tax_rate, q.notes, q.terms, q.id, auth.uid(), now(), false)
    returning id into inv_id;
  insert into public.document_items(document_id, business_id, description, details, quantity, unit_price_minor, sort_order)
    select inv_id, business_id, description, details, quantity, unit_price_minor, sort_order from public.document_items where document_id = q.id;
  insert into public.document_costs(document_id, business_id, label, category, amount_minor, note, sort_order)
    select inv_id, business_id, label, category, amount_minor, note, sort_order from public.document_costs where document_id = q.id;
  perform public.recalculate_document(inv_id);
  update public.documents set converted_invoice_id = inv_id, status = case when status in ('sent','viewed') then 'accepted' else status end,
    accepted_at = coalesce(accepted_at, now()), updated_at = now() where id = q.id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (q.business_id, inv_id, auth.uid(), public.actor_label(q.business_id), 'quote.converted', jsonb_build_object('quote', q.number));
  return inv_id;
end; $$;

-- ---------------------------------------------------------------------
-- Settlement: the only way a document becomes (partly) paid.
-- Locks the document so a webhook retry and a manual entry cannot both
-- issue receipts for the same money.
-- ---------------------------------------------------------------------

create or replace function public.apply_payment(
  doc_id uuid, pay_method text, pay_reference text, pay_amount bigint, pay_currency text,
  pay_note text, attempt uuid, recorder uuid, pay_date timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  inv_id uuid;
  pay_id uuid;
  rcpt_no text;
  new_paid bigint;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found then raise exception 'Document not found'; end if;
  if d.status in ('void','declined') then raise exception 'This document is not payable'; end if;
  if upper(pay_currency) <> d.currency then raise exception 'Currency does not match the document'; end if;
  if pay_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  if attempt is not null then
    select id into pay_id from public.payments where attempt_id = attempt;
    if pay_id is not null then return pay_id; end if; -- replayed webhook
  end if;

  -- paying a quote turns it into an invoice first, so the receipt sits on an invoice
  if d.kind = 'quote' then
    if d.converted_invoice_id is null then
      insert into public.documents(business_id, kind, number, title, customer_id, customer_name, customer_company, customer_email,
          customer_phone, customer_address, currency, status, issue_date, due_date, discount_minor, tax_label, tax_rate,
          notes, terms, source_quote_id, created_by, sent_at)
        values (d.business_id, 'invoice', public.next_document_number(d.business_id, 'invoice'), d.title, d.customer_id, d.customer_name,
          d.customer_company, d.customer_email, d.customer_phone, d.customer_address, d.currency, 'sent', current_date, current_date,
          d.discount_minor, d.tax_label, d.tax_rate, d.notes, d.terms, d.id, d.created_by, now())
        returning id into inv_id;
      insert into public.document_items(document_id, business_id, description, details, quantity, unit_price_minor, sort_order)
        select inv_id, business_id, description, details, quantity, unit_price_minor, sort_order from public.document_items where document_id = d.id;
      insert into public.document_costs(document_id, business_id, label, category, amount_minor, note, sort_order)
        select inv_id, business_id, label, category, amount_minor, note, sort_order from public.document_costs where document_id = d.id;
      perform public.recalculate_document(inv_id);
      update public.documents set converted_invoice_id = inv_id, status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now() where id = d.id;
    else
      inv_id := d.converted_invoice_id;
    end if;
    select * into d from public.documents where id = inv_id for update;
  end if;

  if pay_amount > d.total_minor - d.amount_paid_minor then
    raise exception 'Amount is more than the balance due';
  end if;

  insert into public.payments(business_id, document_id, method, reference, amount_minor, currency, paid_at, note, attempt_id, recorded_by)
    values (d.business_id, d.id, pay_method, coalesce(pay_reference,''), pay_amount, d.currency, coalesce(pay_date, now()), coalesce(pay_note,''), attempt, recorder)
    returning id into pay_id;
  new_paid := d.amount_paid_minor + pay_amount;
  rcpt_no := public.next_document_number(d.business_id, 'receipt');
  insert into public.receipts(business_id, document_id, payment_id, number, amount_minor, currency, balance_after_minor)
    values (d.business_id, d.id, pay_id, rcpt_no, pay_amount, d.currency, d.total_minor - new_paid);
  update public.documents set amount_paid_minor = new_paid,
    status = case when new_paid >= total_minor then 'paid' else 'partially_paid' end,
    paid_at = case when new_paid >= total_minor then now() else paid_at end,
    updated_at = now()
  where id = d.id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (d.business_id, d.id, recorder, case when recorder is null then initcap(pay_method) else public.actor_label(d.business_id) end,
      'payment.recorded', jsonb_build_object('amount_minor', pay_amount, 'method', pay_method, 'receipt', rcpt_no));
  return pay_id;
end; $$;
revoke all on function public.apply_payment(uuid,text,text,bigint,text,text,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_payment(uuid,text,text,bigint,text,text,uuid,uuid,timestamptz) to service_role;

-- bank transfer, cash or POS recorded by the team
create or replace function public.record_manual_payment(
  doc_id uuid, pay_method text, pay_reference text, pay_amount bigint, pay_note text, pay_date date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id;
  if not found or not public.has_role(d.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if pay_method not in ('bank_transfer','cash','pos','other') then raise exception 'Choose how the customer paid'; end if;
  if d.sent_at is null then raise exception 'Send the document before recording a payment'; end if;
  return public.apply_payment(doc_id, pay_method, pay_reference, pay_amount, d.currency, pay_note, null, auth.uid(),
    coalesce(pay_date::timestamptz, now()));
end; $$;

-- ---------------------------------------------------------------------
-- Team invitations
-- ---------------------------------------------------------------------

create or replace function public.accept_invitation(raw_token text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations%rowtype;
  me uuid := auth.uid();
  my_email text;
  p public.plans%rowtype;
  seats integer;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select email into my_email from auth.users where id = me;
  select * into inv from public.invitations where token_hash = encode(digest(raw_token, 'sha256'), 'hex') for update;
  if not found or inv.revoked_at is not null then raise exception 'This invitation is no longer valid'; end if;
  if inv.accepted_at is not null then
    if exists (select 1 from public.memberships where business_id = inv.business_id and user_id = me) then return inv.business_id; end if;
    raise exception 'This invitation has already been used';
  end if;
  if inv.expires_at < now() then raise exception 'This invitation has expired. Ask for a new one.'; end if;
  if lower(my_email) is distinct from inv.email then raise exception 'This invitation was sent to %. Sign in with that email.', inv.email; end if;
  select pl.* into p from public.businesses b join public.plans pl on pl.id = b.plan_id where b.id = inv.business_id and b.subscription_status = 'active';
  if p.seat_limit is not null then
    select count(*) into seats from public.memberships where business_id = inv.business_id;
    if seats >= p.seat_limit then raise exception 'This team is full on its current plan'; end if;
  end if;
  insert into public.memberships(business_id, user_id, role, can_view_costs, full_name, email)
    values (inv.business_id, me, inv.role, inv.can_view_costs, coalesce(my_name,''), lower(my_email))
    on conflict (business_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  insert into public.profiles(user_id, full_name, active_business_id) values (me, coalesce(my_name,''), inv.business_id)
    on conflict (user_id) do update set active_business_id = excluded.active_business_id;
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (inv.business_id, me, coalesce(nullif(my_name,''), my_email), 'team.joined', jsonb_build_object('role', inv.role));
  return inv.business_id;
end; $$;

-- ---------------------------------------------------------------------
-- Public (customer) views, read only through the server with the
-- service role. They never include hidden costs.
-- ---------------------------------------------------------------------

create or replace function public.customer_respond(raw_token text, accept boolean, signer text, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where access_token = raw_token for update;
  if not found or d.kind <> 'quote' then raise exception 'Quote not found'; end if;
  if d.status not in ('sent','viewed') then raise exception 'This quote can no longer be answered'; end if;
  if d.valid_until is not null and d.valid_until < current_date then raise exception 'This quote has expired'; end if;
  if accept then
    update public.documents set status = 'accepted', accepted_at = now(), accepted_name = left(coalesce(signer,''), 120), updated_at = now() where id = d.id;
  else
    update public.documents set status = 'declined', declined_at = now(), decline_reason = left(coalesce(reason,''), 500), updated_at = now() where id = d.id;
  end if;
  insert into public.activity(business_id, document_id, actor_label, action, detail)
    values (d.business_id, d.id, coalesce(nullif(signer,''), d.customer_name), case when accept then 'quote.accepted' else 'quote.declined' end,
      jsonb_build_object('reason', coalesce(reason,'')));
end; $$;
revoke all on function public.customer_respond(text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.customer_respond(text, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Subscriptions: a verified payment (or the platform owner) starts or
-- extends a plan period
-- ---------------------------------------------------------------------

create or replace function public.extend_subscription(
  target uuid, new_plan uuid, pay_method text, pay_reference text, pay_amount bigint, pay_currency text, recorder uuid
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  p public.plans%rowtype;
  starts timestamptz;
  ends timestamptz;
begin
  select * into b from public.businesses where id = target for update;
  if not found then raise exception 'Business not found'; end if;
  select * into p from public.plans where id = new_plan;
  if not found then raise exception 'Plan not found'; end if;
  -- paying early adds to the current period instead of losing days
  starts := case when b.subscription_status = 'active' and b.plan_id = new_plan and b.current_period_end > now() then b.current_period_end else now() end;
  ends := starts + case when p.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  update public.businesses set plan_id = new_plan, subscription_status = 'active', current_period_end = ends, updated_at = now() where id = target;
  insert into public.subscription_payments(business_id, plan_id, method, reference, amount_minor, currency, period_start, period_end, recorded_by)
    values (target, new_plan, pay_method, coalesce(pay_reference,''), pay_amount, pay_currency, starts, ends, recorder);
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (target, recorder, case when recorder is null then 'PayTrail billing' else 'PayTrail admin' end, 'subscription.extended',
      jsonb_build_object('plan', p.name, 'until', ends));
  return ends;
end; $$;
revoke all on function public.extend_subscription(uuid,uuid,text,text,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.extend_subscription(uuid,uuid,text,text,bigint,text,uuid) to service_role;

create or replace function public.activate_subscription(attempt_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare a public.payment_attempts%rowtype;
begin
  select * into a from public.payment_attempts where id = attempt_id for update;
  if not found or a.purpose <> 'subscription' then raise exception 'Not a subscription payment'; end if;
  if exists (select 1 from public.subscription_payments where reference = a.reference) then
    return (select current_period_end from public.businesses where id = a.business_id);
  end if;
  return public.extend_subscription(a.business_id, a.plan_id, a.provider, a.reference, a.amount_minor, a.currency, null);
end; $$;
revoke all on function public.activate_subscription(uuid) from public, anon, authenticated;
grant execute on function public.activate_subscription(uuid) to service_role;

-- platform owner records a manual subscription payment (bank transfer etc.)
create or replace function public.admin_extend_subscription(target uuid, new_plan uuid, pay_reference text, pay_amount bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p public.plans%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  select * into p from public.plans where id = new_plan;
  return public.extend_subscription(target, new_plan, 'manual', pay_reference, coalesce(pay_amount, p.price_minor), p.currency, auth.uid());
end; $$;
grant execute on function public.admin_extend_subscription(uuid, uuid, text, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard figures for the active business
-- ---------------------------------------------------------------------

create or replace function public.business_summary(target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  costs bigint := null;
begin
  if not public.is_member(target) then raise exception 'Not allowed'; end if;
  if public.can_view_costs(target) then
    select coalesce(sum(c.amount_minor), 0) into costs from public.document_costs c
      join public.documents d on d.id = c.document_id
      where d.business_id = target and d.kind = 'invoice' and d.status = 'paid' and d.paid_at >= date_trunc('month', now());
  end if;
  select jsonb_build_object(
    'outstanding_minor', coalesce((select sum(total_minor - amount_paid_minor) from public.documents
        where business_id = target and kind = 'invoice' and status in ('sent','viewed','partially_paid')), 0),
    'overdue_minor', coalesce((select sum(total_minor - amount_paid_minor) from public.documents
        where business_id = target and kind = 'invoice' and status in ('sent','viewed','partially_paid') and due_date < current_date), 0),
    'overdue_count', (select count(*) from public.documents
        where business_id = target and kind = 'invoice' and status in ('sent','viewed','partially_paid') and due_date < current_date),
    'collected_month_minor', coalesce((select sum(amount_minor) from public.payments
        where business_id = target and paid_at >= date_trunc('month', now())), 0),
    'collected_last_month_minor', coalesce((select sum(amount_minor) from public.payments
        where business_id = target and paid_at >= date_trunc('month', now()) - interval '1 month' and paid_at < date_trunc('month', now())), 0),
    'open_quotes_minor', coalesce((select sum(total_minor) from public.documents
        where business_id = target and kind = 'quote' and status in ('sent','viewed')), 0),
    'open_quotes_count', (select count(*) from public.documents
        where business_id = target and kind = 'quote' and status in ('sent','viewed')),
    'awaiting_approval', (select count(*) from public.documents where business_id = target and status = 'pending_approval'),
    'paid_month_revenue_minor', coalesce((select sum(total_minor) from public.documents
        where business_id = target and kind = 'invoice' and status = 'paid' and paid_at >= date_trunc('month', now())), 0),
    'paid_month_costs_minor', costs,
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'collected_minor', coalesce(x.total, 0)) order by m)
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
        left join (select date_trunc('month', paid_at) mm, sum(amount_minor) total from public.payments where business_id = target group by 1) x on x.mm = m), '[]'::jsonb)
  ) into result;
  return result;
end; $$;

-- platform owner: everything at a glance
create or replace function public.platform_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'businesses', (select count(*) from public.businesses),
    'companies', (select count(*) from public.businesses where kind = 'company'),
    'trialing', (select count(*) from public.businesses where subscription_status = 'trialing'),
    'active', (select count(*) from public.businesses where subscription_status = 'active'),
    'past_due', (select count(*) from public.businesses where subscription_status in ('past_due','canceled')),
    'documents_month', (select count(*) from public.documents where sent_at >= date_trunc('month', now())),
    'subscription_revenue_month', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount_minor) total from public.subscription_payments where created_at >= date_trunc('month', now()) group by currency) x), '{}'::jsonb)
  );
end; $$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------

alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.plans enable row level security;
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.customers enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.document_costs enable row level security;
alter table public.cost_presets enable row level security;
alter table public.payment_connections enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.activity enable row level security;

-- platform
drop policy if exists "admins see admins" on public.platform_admins;
create policy "admins see admins" on public.platform_admins for select using (public.is_platform_admin() or user_id = auth.uid());
drop policy if exists "admins manage settings" on public.platform_settings;
create policy "admins manage settings" on public.platform_settings for all using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "anyone reads active plans" on public.plans;
create policy "anyone reads active plans" on public.plans for select using (active or public.is_platform_admin());
drop policy if exists "admins manage plans" on public.plans;
create policy "admins manage plans" on public.plans for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- businesses: members read; owner and manager edit profile fields (billing columns are guarded by a trigger)
drop policy if exists "members read business" on public.businesses;
create policy "members read business" on public.businesses for select using (public.is_member(id) or public.is_platform_admin());
drop policy if exists "managers edit business" on public.businesses;
create policy "managers edit business" on public.businesses for update using (public.has_role(id, array['owner','manager']) or public.is_platform_admin())
  with check (public.has_role(id, array['owner','manager']) or public.is_platform_admin());

-- SECURITY INVOKER on purpose: current_user is then the caller's role, which
-- tells a direct browser update apart from PayTrail's own functions
create or replace function public.guard_business_billing() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- only the platform owner, the server, or PayTrail's own functions (which run
  -- as the table owner) change plan, status and counters
  if current_user in ('authenticated','anon') and not public.is_platform_admin() then
    new.plan_id := old.plan_id;
    new.subscription_status := old.subscription_status;
    new.trial_documents_used := old.trial_documents_used;
    new.trial_ends_at := old.trial_ends_at;
    new.current_period_end := old.current_period_end;
    new.quote_seq := old.quote_seq;
    new.invoice_seq := old.invoice_seq;
    new.receipt_seq := old.receipt_seq;
    new.kind := old.kind;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists businesses_guard on public.businesses;
create trigger businesses_guard before update on public.businesses for each row execute function public.guard_business_billing();

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and (active_business_id is null or public.is_member(active_business_id)));

-- memberships
drop policy if exists "members see team" on public.memberships;
create policy "members see team" on public.memberships for select using (public.is_member(business_id) or public.is_platform_admin());
drop policy if exists "managers change team" on public.memberships;
create policy "managers change team" on public.memberships for update
  using (public.has_role(business_id, array['owner','manager']) and role <> 'owner' and user_id <> auth.uid()
    and (role <> 'manager' or public.member_role(business_id) = 'owner'))
  with check (public.has_role(business_id, array['owner','manager']) and role <> 'owner'
    and (role <> 'manager' or public.member_role(business_id) = 'owner'));
drop policy if exists "managers remove team" on public.memberships;
create policy "managers remove team" on public.memberships for delete
  using ((public.has_role(business_id, array['owner','manager']) and role <> 'owner'
      and (role <> 'manager' or public.member_role(business_id) = 'owner'))
    or (user_id = auth.uid() and role <> 'owner'));

drop policy if exists "managers manage invitations" on public.invitations;
drop policy if exists "managers read invitations" on public.invitations;
create policy "managers read invitations" on public.invitations for select using (public.has_role(business_id, array['owner','manager']));
drop policy if exists "managers create invitations" on public.invitations;
create policy "managers create invitations" on public.invitations for insert
  with check (public.has_role(business_id, array['owner','manager']) and invited_by = auth.uid() and accepted_at is null and revoked_at is null
    and (role <> 'manager' or public.member_role(business_id) = 'owner'));
drop policy if exists "managers revoke invitations" on public.invitations;
create policy "managers revoke invitations" on public.invitations for update
  using (public.has_role(business_id, array['owner','manager'])) with check (public.has_role(business_id, array['owner','manager']));

-- customers: every member
drop policy if exists "members manage customers" on public.customers;
create policy "members manage customers" on public.customers for all using (public.is_member(business_id)) with check (public.is_member(business_id));

-- documents: everyone reads; writes go through the functions above
drop policy if exists "members read documents" on public.documents;
create policy "members read documents" on public.documents for select using (public.is_member(business_id) or public.is_platform_admin());
drop policy if exists "members read items" on public.document_items;
create policy "members read items" on public.document_items for select using (public.is_member(business_id));

-- hidden costs: only owner, manager, and members explicitly allowed
drop policy if exists "cost viewers read costs" on public.document_costs;
create policy "cost viewers read costs" on public.document_costs for select using (public.can_view_costs(business_id));
drop policy if exists "cost viewers manage presets" on public.cost_presets;
create policy "cost viewers manage presets" on public.cost_presets for all using (public.can_view_costs(business_id)) with check (public.can_view_costs(business_id));

-- payment connections: owner and manager; secrets are never selected by the app
drop policy if exists "managers read connections" on public.payment_connections;
create policy "managers read connections" on public.payment_connections for select using (public.has_role(business_id, array['owner','manager','finance']));

drop policy if exists "members read attempts" on public.payment_attempts;
create policy "members read attempts" on public.payment_attempts for select using (business_id is not null and public.is_member(business_id));
drop policy if exists "members read payments" on public.payments;
create policy "members read payments" on public.payments for select using (public.is_member(business_id) or public.is_platform_admin());
drop policy if exists "members read receipts" on public.receipts;
create policy "members read receipts" on public.receipts for select using (public.is_member(business_id));
drop policy if exists "members read subscription" on public.subscription_payments;
create policy "members read subscription" on public.subscription_payments for select using (public.has_role(business_id, array['owner']) or public.is_platform_admin());
drop policy if exists "members log activity" on public.activity;
drop policy if exists "members read activity" on public.activity;
create policy "members read activity" on public.activity for select using (public.is_member(business_id) or public.is_platform_admin());

-- column privileges: the browser never receives stored secrets. A table-wide
-- grant would override a column revoke, so only the safe columns are granted.
revoke all on public.payment_connections from anon, authenticated;
grant select (business_id, provider, mode, key_hint, enabled, payment_confirmed_at, webhook_confirmed_at,
  last_test_reference, last_error, last_event_at, created_at, updated_at) on public.payment_connections to authenticated;
revoke all on public.platform_settings from anon, authenticated;
grant select (id, trial_mode, trial_documents, trial_days, billing_provider, billing_key_hint, support_email, updated_at)
  on public.platform_settings to authenticated;
grant update (trial_mode, trial_documents, trial_days, billing_provider, support_email, updated_at)
  on public.platform_settings to authenticated;

-- team rows: only role and cost visibility can be changed; invitations can only be revoked
revoke update on public.memberships from anon, authenticated;
grant update (role, can_view_costs) on public.memberships to authenticated;
revoke update on public.invitations from anon, authenticated;
grant update (revoked_at) on public.invitations to authenticated;

-- functions callable by signed-in users
-- Postgres (and Supabase's defaults) let everyone execute new functions.
-- Close that, then grant back exactly what the app needs.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_platform_admin(), public.member_role(uuid), public.is_member(uuid),
  public.has_role(uuid, text[]), public.can_view_costs(uuid) to anon, authenticated, service_role;
grant execute on function public.create_business(text, text, text, text) to authenticated;
grant execute on function public.business_allowance(uuid) to authenticated, service_role;
grant execute on function public.submit_document(uuid) to authenticated;
grant execute on function public.mark_document_sent(uuid, timestamptz) to authenticated;
grant execute on function public.return_document_to_draft(uuid, text) to authenticated;
grant execute on function public.void_document(uuid) to authenticated;
grant execute on function public.delete_draft(uuid) to authenticated;
grant execute on function public.convert_quote_to_invoice(uuid) to authenticated;
grant execute on function public.record_manual_payment(uuid, text, text, bigint, text, date) to authenticated;
grant execute on function public.accept_invitation(text, text) to authenticated;
grant execute on function public.business_summary(uuid) to authenticated;
grant execute on function public.platform_summary() to authenticated;
grant execute on function public.admin_extend_subscription(uuid, uuid, text, bigint) to authenticated;
grant execute on function public.save_document(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_payment(uuid,text,text,bigint,text,text,uuid,uuid,timestamptz), public.customer_respond(text, boolean, text, text),
  public.extend_subscription(uuid,uuid,text,text,bigint,text,uuid), public.activate_subscription(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Storage: business logos (public read, members of the business write)
-- path: <business_id>/logo-<timestamp>.png
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('logos', 'logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
      on conflict (id) do nothing;
    execute 'drop policy if exists "managers upload logos" on storage.objects';
    execute $p$create policy "managers upload logos" on storage.objects for insert to authenticated
      with check (bucket_id = 'logos' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','manager']))$p$;
    execute 'drop policy if exists "managers replace logos" on storage.objects';
    execute $p$create policy "managers replace logos" on storage.objects for update to authenticated
      using (bucket_id = 'logos' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','manager']))$p$;
  end if;
end $$;
