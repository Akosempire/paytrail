-- Nigeria's digital postcode (NIPOST, Oct 2026) on addresses, and a delivery
-- address on quotes and invoices.
--  * businesses and customers: postcode (EK-01-A03-FK-01), the area NIPOST
--    returned, and when it was verified
--  * documents: the customer's postcode (copied while a draft, like the TIN),
--    and a delivery address + postcode + contact for the dispatch rider
-- Verification with the NIPOST API happens in the app (the key stays server-side).

create or replace function public.clean_postcode(v text) returns text
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then ''
    when upper(regexp_replace(v, '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z]{2}(0[1-9]|[1-9][0-9])[A-Z0-9]{3}[A-Z]{2}(0[1-9]|[1-9][0-9])$'
      then regexp_replace(upper(regexp_replace(v, '[^A-Za-z0-9]', '', 'g')), '^(..)(..)(...)(..)(..)$', '\1-\2-\3-\4-\5')
    else '' end;
$$;

alter table public.businesses add column if not exists postcode text not null default '';
alter table public.businesses add column if not exists postcode_area text not null default '';
alter table public.businesses add column if not exists postcode_verified_at timestamptz;
alter table public.customers add column if not exists postcode text not null default '';
alter table public.customers add column if not exists postcode_area text not null default '';
alter table public.customers add column if not exists postcode_verified_at timestamptz;
alter table public.documents add column if not exists customer_postcode text not null default '';
alter table public.documents add column if not exists delivery_address text not null default '';
alter table public.documents add column if not exists delivery_postcode text not null default '';
alter table public.documents add column if not exists delivery_postcode_area text not null default '';
alter table public.documents add column if not exists delivery_contact text not null default '';

do $$ begin
  alter table public.businesses add constraint businesses_postcode_format check (postcode = '' or postcode ~ '^[A-Z]{2}-[0-9]{2}-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.customers add constraint customers_postcode_format check (postcode = '' or postcode ~ '^[A-Z]{2}-[0-9]{2}-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents add constraint documents_delivery_postcode_format check (delivery_postcode = '' or delivery_postcode ~ '^[A-Z]{2}-[0-9]{2}-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}$');
exception when duplicate_object then null; end $$;

-- the customer's TIN and postcode are copied onto drafts, then kept as sent
create or replace function public.copy_customer_tax_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('draft', 'pending_approval') then
    select coalesce(tax_id, ''), coalesce(postcode, '') into new.customer_tax_id, new.customer_postcode
      from public.customers where id = new.customer_id;
    new.customer_tax_id := coalesce(new.customer_tax_id, '');
    new.customer_postcode := coalesce(new.customer_postcode, '');
  end if;
  return new;
end; $$;

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
    insert into public.customers(business_id, name, company, email, phone, address, postcode, postcode_area, postcode_verified_at)
      values (target, trim(payload->'customer'->>'name'), coalesce(payload->'customer'->>'company',''),
        lower(coalesce(payload->'customer'->>'email','')), coalesce(payload->'customer'->>'phone',''),
        coalesce(payload->'customer'->>'address',''), public.clean_postcode(payload->'customer'->>'postcode'),
        coalesce(payload->'customer'->>'postcode_area',''),
        case when coalesce((payload->'customer'->>'postcode_verified')::boolean, false) then now() end)
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
    -- where the goods go, when it isn't the customer's address
    delivery_address = case when payload ? 'delivery' then left(coalesce(payload->'delivery'->>'address', ''), 500) else delivery_address end,
    delivery_postcode = case when payload ? 'delivery' then public.clean_postcode(payload->'delivery'->>'postcode') else delivery_postcode end,
    delivery_postcode_area = case when payload ? 'delivery' then left(coalesce(payload->'delivery'->>'postcode_area', ''), 120) else delivery_postcode_area end,
    delivery_contact = case when payload ? 'delivery' then left(coalesce(payload->'delivery'->>'contact', ''), 160) else delivery_contact end,
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
