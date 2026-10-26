-- Usetally: everything new from 26 Oct 2026, in order. Safe to run more than once.

-- ===================== RUN_NEW_2026-10-26a.sql =====================
-- Usetally: offline mode. Every change made offline carries an id; the server
-- records each one it applies, so a change sent twice (a retry after a dropped
-- connection) is applied once. Safe to run more than once.
create table if not exists public.offline_ops (
  id text primary key check (char_length(id) between 8 and 80),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  result jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists offline_ops_business_idx on public.offline_ops(business_id, created_at desc);
alter table public.offline_ops enable row level security;
drop policy if exists "members read their offline ops" on public.offline_ops;
create policy "members read their offline ops" on public.offline_ops for select using (public.is_member(business_id));
drop policy if exists "members record offline ops" on public.offline_ops;
create policy "members record offline ops" on public.offline_ops for insert with check (public.is_member(business_id) and user_id = auth.uid());
grant select, insert on public.offline_ops to authenticated;
grant all on public.offline_ops to service_role;

-- ===================== RUN_NEW_2026-10-26b.sql =====================
-- Usetally: "I've sent it". A customer who paid by bank transfer tells the
-- business from their link (amount, date, optional proof). Nothing is recorded
-- until someone on the team confirms the money arrived; then the payment and
-- receipt are created in one step, once, however many times Confirm is pressed.
-- Safe to run more than once.
create table if not exists public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  payer_name text not null default '' check (char_length(payer_name) <= 120),
  paid_on date not null default current_date,
  note text not null default '' check (char_length(note) <= 500),
  file_id uuid references public.document_files(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  payment_id uuid references public.payments(id) on delete set null,
  reply text not null default '' check (char_length(reply) <= 500),
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payment_claims_document_idx on public.payment_claims(document_id, created_at desc);
create index if not exists payment_claims_pending_idx on public.payment_claims(business_id) where status = 'pending';

alter table public.payment_claims enable row level security;
drop policy if exists "members read payment claims" on public.payment_claims;
create policy "members read payment claims" on public.payment_claims for select using (public.is_member(business_id));
grant select on public.payment_claims to authenticated;
grant all on public.payment_claims to service_role;

-- the customer, from their link (called by the server with the link's token)
create or replace function public.submit_payment_claim(
  raw_token text, claim_amount bigint, claim_payer text, claim_date date, claim_note text, claim_file uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype; t public.documents%rowtype; new_id uuid; waiting int;
begin
  select * into d from public.documents where access_token = raw_token;
  if not found or d.status in ('draft', 'pending_approval') then raise exception 'This document could not be found'; end if;
  t := d;
  if d.converted_invoice_id is not null then select * into t from public.documents where id = d.converted_invoice_id; end if;
  if t.status in ('void', 'declined') then raise exception 'This document can''t be paid'; end if;
  if d.kind = 'quote' and d.converted_invoice_id is null and d.status <> 'accepted' then raise exception 'Accept the quote first, then pay'; end if;
  if claim_amount is null or claim_amount <= 0 then raise exception 'Enter the amount you sent'; end if;
  if claim_amount > t.total_minor - t.amount_paid_minor then raise exception 'That''s more than the balance due'; end if;
  if claim_date is not null and (claim_date > current_date + 1 or claim_date < current_date - 120) then raise exception 'Check the date you paid'; end if;
  select count(*) into waiting from public.payment_claims where document_id = t.id and status = 'pending';
  if waiting >= 3 then raise exception 'You''ve already told them about this payment. They''ll confirm it soon'; end if;
  if claim_file is not null and not exists (select 1 from public.document_files where id = claim_file and document_id = t.id) then claim_file := null; end if;
  insert into public.payment_claims(business_id, document_id, amount_minor, currency, payer_name, paid_on, note, file_id)
    values (t.business_id, t.id, claim_amount, t.currency, left(coalesce(claim_payer, ''), 120), coalesce(claim_date, current_date), left(coalesce(claim_note, ''), 500), claim_file)
    returning id into new_id;
  insert into public.activity(business_id, document_id, actor_label, action, detail)
    values (t.business_id, t.id, coalesce(nullif(claim_payer, ''), nullif(t.customer_name, ''), 'Customer'), 'payment.claimed',
      jsonb_build_object('amount_minor', claim_amount));
  return new_id;
end; $$;
revoke all on function public.submit_payment_claim(text, bigint, text, date, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_payment_claim(text, bigint, text, date, text, uuid) to service_role;

-- the team: the money arrived. Records the payment and issues the receipt.
create or replace function public.confirm_payment_claim(claim_id uuid, confirm_amount bigint default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.payment_claims%rowtype; pay_id uuid; amt bigint;
begin
  select * into c from public.payment_claims where id = claim_id for update;
  if not found or not public.has_role(c.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if c.status = 'confirmed' then return c.payment_id; end if; -- pressed twice
  if c.status <> 'pending' then raise exception 'This was already marked as not received'; end if;
  amt := coalesce(confirm_amount, c.amount_minor);
  pay_id := public.apply_payment(c.document_id, 'bank_transfer', 'Transfer from ' || coalesce(nullif(c.payer_name, ''), 'customer'), amt, c.currency,
    nullif(c.note, ''), null, auth.uid(), c.paid_on::timestamptz);
  update public.payment_claims set status = 'confirmed', payment_id = pay_id, amount_minor = amt, decided_by = auth.uid(),
    decided_by_name = public.actor_label(c.business_id), decided_at = now() where id = c.id;
  return pay_id;
end; $$;
revoke all on function public.confirm_payment_claim(uuid, bigint) from public, anon;
grant execute on function public.confirm_payment_claim(uuid, bigint) to authenticated, service_role;

-- the team: not received (yet). The customer sees the reason on their link.
create or replace function public.reject_payment_claim(claim_id uuid, why text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.payment_claims%rowtype;
begin
  select * into c from public.payment_claims where id = claim_id for update;
  if not found or not public.has_role(c.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if c.status <> 'pending' then return; end if;
  update public.payment_claims set status = 'rejected', reply = left(coalesce(why, ''), 500), decided_by = auth.uid(),
    decided_by_name = public.actor_label(c.business_id), decided_at = now() where id = c.id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (c.business_id, c.document_id, auth.uid(), public.actor_label(c.business_id), 'payment.claim_rejected',
      jsonb_build_object('amount_minor', c.amount_minor, 'reason', left(coalesce(why, ''), 500)));
end; $$;
revoke all on function public.reject_payment_claim(uuid, text) from public, anon;
grant execute on function public.reject_payment_claim(uuid, text) to authenticated, service_role;

-- ===================== RUN_NEW_2026-10-26c.sql =====================
-- Usetally: the team gets one email a day listing transfers waiting to be
-- confirmed, not one per customer. This marks which claims were included.
-- Safe to run more than once.
alter table public.payment_claims add column if not exists digest_sent_at timestamptz;
create index if not exists payment_claims_digest_idx on public.payment_claims(created_at) where status = 'pending' and digest_sent_at is null;

-- ===================== RUN_NEW_2026-10-26d.sql =====================
-- Usetally: tax. The customer's TIN on their invoices, and withholding tax
-- (WHT) a customer deducted at source when they paid. Safe to run more than once.

-- the customer's Tax Identification Number
alter table public.customers add column if not exists tax_id text not null default '';
do $$ begin
  alter table public.customers add constraint customers_tax_id_len check (char_length(tax_id) <= 40);
exception when duplicate_object then null; end $$;

-- copied onto the document while it's a draft, then kept as it was when sent
alter table public.documents add column if not exists customer_tax_id text not null default '';
create or replace function public.copy_customer_tax_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('draft', 'pending_approval') then
    new.customer_tax_id := coalesce((select tax_id from public.customers where id = new.customer_id), '');
  end if;
  return new;
end; $$;
drop trigger if exists documents_customer_tax_id on public.documents;
create trigger documents_customer_tax_id before insert or update of customer_id, status, updated_at on public.documents
  for each row execute function public.copy_customer_tax_id();

-- withholding tax deducted by the customer: part of what settles the invoice,
-- shown separately on the payment and the receipt
alter table public.payments add column if not exists wht_minor bigint not null default 0;
alter table public.receipts add column if not exists wht_minor bigint not null default 0;
do $$ begin
  alter table public.payments add constraint payments_wht_range check (wht_minor >= 0 and wht_minor <= amount_minor);
exception when duplicate_object then null; end $$;
create index if not exists payments_wht_idx on public.payments(business_id, paid_at) where wht_minor > 0;

-- the team records a payment where the customer withheld tax: cash received
-- plus WHT together settle the invoice; one payment and one receipt
create or replace function public.record_payment_with_wht(
  doc_id uuid, pay_method text, pay_reference text, cash_amount bigint, wht_amount bigint, pay_note text, pay_date date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype; pay_id uuid;
begin
  select * into d from public.documents where id = doc_id;
  if not found or not public.has_role(d.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if pay_method not in ('bank_transfer','cash','pos','other') then raise exception 'Choose how the customer paid'; end if;
  if d.sent_at is null then raise exception 'Send the document before recording a payment'; end if;
  if coalesce(cash_amount, 0) < 0 or coalesce(wht_amount, 0) < 0 then raise exception 'Amounts can''t be negative'; end if;
  if coalesce(cash_amount, 0) + coalesce(wht_amount, 0) <= 0 then raise exception 'Enter the amount you received'; end if;
  pay_id := public.apply_payment(doc_id, pay_method, pay_reference, coalesce(cash_amount, 0) + coalesce(wht_amount, 0), d.currency, pay_note, null, auth.uid(),
    coalesce(pay_date::timestamptz, now()));
  if coalesce(wht_amount, 0) > 0 then
    update public.payments set wht_minor = wht_amount where id = pay_id;
    update public.receipts set wht_minor = wht_amount where payment_id = pay_id;
  end if;
  return pay_id;
end; $$;
revoke all on function public.record_payment_with_wht(uuid, text, text, bigint, bigint, text, date) from public, anon;
grant execute on function public.record_payment_with_wht(uuid, text, text, bigint, bigint, text, date) to authenticated, service_role;

-- ===================== RUN_NEW_2026-10-26e.sql =====================
-- Usetally: monitoring. The last result of each health check (so you're told
-- only when something changes), real failures users hit, and where alerts go.
-- Only the server (service role) reads or writes these. Safe to run more than once.
create table if not exists public.monitor_state (
  check_key text primary key,
  status text not null check (status in ('ok', 'warn', 'down')),
  detail text not null default '',
  changed_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  alerted_at timestamptz
);
create table if not exists public.monitor_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists monitor_events_recent_idx on public.monitor_events(kind, created_at desc);
alter table public.monitor_state enable row level security;
alter table public.monitor_events enable row level security;
grant all on public.monitor_state, public.monitor_events to service_role;

-- Telegram / Slack / Discord webhook for alerts (stored encrypted)
alter table public.platform_settings add column if not exists alert_webhook_enc text;
alter table public.platform_settings add column if not exists alert_webhook_hint text not null default '';

-- ===================== RUN_NEW_2026-10-26f.sql =====================
-- Usetally: VAT per item. Each line is standard-rated, zero-rated or exempt,
-- and a document can have VAT-inclusive prices. Totals are still worked out
-- here in the database. Safe to run more than once.
alter table public.document_items add column if not exists vat_category text;
do $$ begin
  alter table public.document_items add constraint document_items_vat_category check (vat_category is null or vat_category in ('standard','zero','exempt'));
exception when duplicate_object then null; end $$;
alter table public.documents add column if not exists prices_include_vat boolean not null default false;

-- an invoice made from a quote keeps each line's VAT category and the
-- "prices include VAT" choice (lines saved without one are standard-rated)
create or replace function public.fill_item_vat_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vat_category is null then
    select qi.vat_category into new.vat_category from public.documents d
      join public.document_items qi on qi.document_id = d.source_quote_id and qi.sort_order = new.sort_order
      where d.id = new.document_id limit 1;
    new.vat_category := coalesce(new.vat_category, 'standard');
  end if;
  return new;
end; $$;
drop trigger if exists document_items_vat_category on public.document_items;
create trigger document_items_vat_category before insert on public.document_items for each row execute function public.fill_item_vat_category();

create or replace function public.copy_prices_include_vat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source_quote_id is not null then
    new.prices_include_vat := coalesce((select prices_include_vat from public.documents where id = new.source_quote_id), false);
  end if;
  return new;
end; $$;
drop trigger if exists documents_prices_include_vat on public.documents;
create trigger documents_prices_include_vat before insert on public.documents for each row execute function public.copy_prices_include_vat();

-- totals: VAT only on standard-rated lines, after their share of the discount.
-- With VAT-inclusive prices the VAT is the part already inside those prices.
create or replace function public.recalculate_document(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  sub bigint; std bigint; disc bigint; std_after numeric; tax bigint; total bigint;
begin
  select * into d from public.documents where id = target for update;
  if not found then return; end if;
  select coalesce(sum(round(quantity * unit_price_minor)), 0)::bigint,
         coalesce(sum(round(quantity * unit_price_minor)) filter (where coalesce(vat_category, 'standard') = 'standard'), 0)::bigint
    into sub, std from public.document_items where document_id = target;
  disc := least(greatest(d.discount_minor, 0), sub);
  std_after := case when sub > 0 then std - disc::numeric * std / sub else 0 end;
  if d.prices_include_vat then
    tax := round(std_after * d.tax_rate / (100 + d.tax_rate))::bigint;
    total := sub - disc;
  else
    tax := round(std_after * d.tax_rate / 100)::bigint;
    total := sub - disc + tax;
  end if;
  update public.documents set subtotal_minor = sub, discount_minor = disc, tax_minor = tax, total_minor = total, updated_at = now() where id = target;
end; $$;
revoke all on function public.recalculate_document(uuid) from public, anon, authenticated;

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
    prices_include_vat = case when payload ? 'prices_include_vat' then coalesce((payload->>'prices_include_vat')::boolean, false) else prices_include_vat end,
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
        insert into public.document_items(document_id, business_id, description, details, quantity, unit_price_minor, sort_order, vat_category)
          values (d.id, target, trim(item->>'description'), coalesce(item->>'details',''),
            greatest(coalesce((item->>'quantity')::numeric, 1), 0.01),
            greatest(coalesce((item->>'unit_price_minor')::bigint, 0), 0), i,
            case when item->>'vat_category' in ('zero','exempt') then item->>'vat_category' else 'standard' end);
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
