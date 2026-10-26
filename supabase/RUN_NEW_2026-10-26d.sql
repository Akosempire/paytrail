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
