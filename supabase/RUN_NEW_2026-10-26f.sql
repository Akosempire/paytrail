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
