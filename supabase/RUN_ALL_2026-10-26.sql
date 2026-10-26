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
