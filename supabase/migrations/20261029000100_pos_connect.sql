-- Usetally ↔ TrackOja POS (docs/POS_CONNECT.md, v1). Safe to run more than once.
--
--  1. Where a document came from: documents.source ('app' | 'pos') and
--     source_ref (the TrackOja sale id). A line can point at a TrackOja product
--     (document_items.external_product_id).
--  2. pos_link_codes: one-time codes from the approval page (only a SHA-256 is
--     kept; 10 minutes; single use).
--  3. pos_connections: the link to one TrackOja store. The key is kept as a
--     SHA-256 (to check TrackOja's calls) and encrypted (to call TrackOja
--     back). One active link per business and per store. Members see the link
--     without any key columns; owners and managers can disconnect.
--  4. pos_sales: each imported TrackOja sale, once (idempotent on its id).
--  5. pos_import_sale / pos_void_sale: what /api/pos/sales calls (service role
--     only). A POS sale becomes a sent invoice whose total is exactly
--     TrackOja's; its payments go through apply_payment, so receipts are issued
--     the usual way. POS invoices never count toward the plan allowance and
--     Usetally never emails anyone about them.
--  6. pos_stock_pushes: when an invoice (not a POS one) with TrackOja products
--     becomes fully paid, a row is queued here, however the payment arrived
--     (team, provider webhook, confirmed transfer). The server sends it to
--     TrackOja's usetally-stock once; the daily job retries failures.

-- 1 -------------------------------------------------------------------------
alter table public.documents add column if not exists source text not null default 'app';
alter table public.documents add column if not exists source_ref text;
do $$ begin
  alter table public.documents add constraint documents_source check (source in ('app', 'pos'));
exception when duplicate_object then null; end $$;
create index if not exists documents_source_idx on public.documents(business_id, source, source_ref) where source <> 'app';

alter table public.document_items add column if not exists external_product_id text;
do $$ begin
  alter table public.document_items add constraint document_items_external_product_id check (external_product_id is null or external_product_id ~ '^[0-9A-Za-z-]{1,64}$');
exception when duplicate_object then null; end $$;

-- an invoice made from a quote (accepted, converted, or paid) keeps each
-- line's TrackOja product, like it keeps the line's VAT category
create or replace function public.fill_item_external_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.external_product_id is null then
    select qi.external_product_id into new.external_product_id from public.documents d
      join public.document_items qi on qi.document_id = d.source_quote_id and qi.sort_order = new.sort_order
      where d.id = new.document_id limit 1;
  end if;
  return new;
end; $$;
drop trigger if exists document_items_external_product on public.document_items;
create trigger document_items_external_product before insert on public.document_items for each row execute function public.fill_item_external_product();

-- 2 -------------------------------------------------------------------------
create table if not exists public.pos_link_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  store_name text not null default '' check (char_length(store_name) <= 120),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pos_link_codes enable row level security;
revoke all on public.pos_link_codes from anon, authenticated;
grant all on public.pos_link_codes to service_role;

-- 3 -------------------------------------------------------------------------
create table if not exists public.pos_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_enc text not null,
  key_hint text not null default '',
  store_id uuid not null,
  store_name text not null default '' check (char_length(store_name) <= 120),
  callback_base text not null check (callback_base ~ '^https?://' and char_length(callback_base) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists pos_connections_one_per_business on public.pos_connections(business_id) where revoked_at is null;
create unique index if not exists pos_connections_one_per_store on public.pos_connections(store_id) where revoked_at is null;
alter table public.pos_connections enable row level security;
drop policy if exists "members read pos connection" on public.pos_connections;
create policy "members read pos connection" on public.pos_connections for select using (public.is_member(business_id));
-- the key columns (hash, encrypted key, hint) and the callback address are
-- never readable from the browser: only these columns are granted
revoke all on public.pos_connections from anon, authenticated;
grant select (id, business_id, store_id, store_name, created_by, created_at, last_used_at, revoked_at) on public.pos_connections to authenticated;
grant all on public.pos_connections to service_role;

-- 4 -------------------------------------------------------------------------
create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid references public.pos_connections(id) on delete set null,
  external_id text not null check (external_id ~ '^[0-9A-Za-z-]{1,64}$'),
  document_id uuid references public.documents(id) on delete set null,
  status text not null default 'imported' check (status in ('imported', 'voided')),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  unique (business_id, external_id)
);
create index if not exists pos_sales_business_idx on public.pos_sales(business_id, created_at desc);
alter table public.pos_sales enable row level security;
drop policy if exists "members read pos sales" on public.pos_sales;
create policy "members read pos sales" on public.pos_sales for select using (public.is_member(business_id));
revoke all on public.pos_sales from anon, authenticated;
grant select on public.pos_sales to authenticated;
grant all on public.pos_sales to service_role;

-- 6 (table first, the trigger needs it) ---------------------------------------
create table if not exists public.pos_stock_pushes (
  document_id uuid primary key references public.documents(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  connection_id uuid references public.pos_connections(id) on delete set null,
  number text not null,
  lines jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text not null default '',
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists pos_stock_pushes_due_idx on public.pos_stock_pushes(next_attempt_at) where status = 'pending';
alter table public.pos_stock_pushes enable row level security;
drop policy if exists "members read stock pushes" on public.pos_stock_pushes;
create policy "members read stock pushes" on public.pos_stock_pushes for select using (public.is_member(business_id));
revoke all on public.pos_stock_pushes from anon, authenticated;
grant select on public.pos_stock_pushes to authenticated;
grant all on public.pos_stock_pushes to service_role;

-- an invoice with TrackOja products became fully paid: queue one stock update
-- (whatever recorded the payment: the team, a provider, a confirmed transfer)
create or replace function public.queue_pos_stock_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare conn uuid; ls jsonb;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.kind = 'invoice' and coalesce(new.source, 'app') <> 'pos' then
    select jsonb_agg(jsonb_build_object('product_id', x.pid, 'quantity', x.qty) order by x.pid) into ls
      from (select external_product_id pid, sum(quantity) qty from public.document_items
            where document_id = new.id and external_product_id is not null group by 1) x;
    if ls is null then return new; end if;
    select id into conn from public.pos_connections where business_id = new.business_id and revoked_at is null;
    if conn is null then return new; end if;
    insert into public.pos_stock_pushes(document_id, business_id, connection_id, number, lines)
      values (new.id, new.business_id, conn, new.number, ls)
      on conflict (document_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists documents_pos_stock on public.documents;
create trigger documents_pos_stock after update of status on public.documents for each row execute function public.queue_pos_stock_push();

-- POS totals are TrackOja's (its taxes are per line, after line discounts),
-- so they are never recomputed from Usetally's single tax rate
create or replace function public.recalculate_document(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  sub bigint; std bigint; disc bigint; std_after numeric; tax bigint; tax2 bigint; total bigint; r numeric;
begin
  select * into d from public.documents where id = target for update;
  if not found then return; end if;
  if d.source = 'pos' then return; end if;
  select coalesce(sum(round(quantity * unit_price_minor)), 0)::bigint,
         coalesce(sum(round(quantity * unit_price_minor)) filter (where coalesce(vat_category, 'standard') = 'standard'), 0)::bigint
    into sub, std from public.document_items where document_id = target;
  disc := least(greatest(d.discount_minor, 0), sub);
  std_after := case when sub > 0 then std - disc::numeric * std / sub else 0 end;
  r := coalesce(d.tax_rate, 0) + coalesce(d.tax2_rate, 0);
  if d.prices_include_vat then
    tax := case when r > 0 then round(std_after * r / (100 + r))::bigint else 0 end;
    tax2 := case when r > 0 then round(tax::numeric * coalesce(d.tax2_rate, 0) / r)::bigint else 0 end;
    total := sub - disc;
  else
    tax2 := round(std_after * coalesce(d.tax2_rate, 0) / 100)::bigint;
    tax := round(std_after * coalesce(d.tax_rate, 0) / 100)::bigint + tax2;
    total := sub - disc + tax;
  end if;
  update public.documents set subtotal_minor = sub, discount_minor = disc, tax_minor = tax, tax2_minor = tax2, total_minor = total, updated_at = now() where id = target;
end; $$;
revoke all on function public.recalculate_document(uuid) from public, anon, authenticated;

-- a sale voided at the till is voided in TrackOja (the import keeps them in step)
create or replace function public.void_document(doc_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or not public.has_role(d.business_id, array['owner','manager','finance']) then raise exception 'Not allowed'; end if;
  if d.source = 'pos' then raise exception 'This sale came from TrackOja POS. Void it in TrackOja and it will be voided here too.'; end if;
  if d.amount_paid_minor > 0 then raise exception 'This document has payments recorded and cannot be voided'; end if;
  update public.documents set status = 'void', voided_at = now(), updated_at = now() where id = doc_id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action)
    values (d.business_id, doc_id, auth.uid(), public.actor_label(d.business_id), 'document.voided');
end; $$;

-- save_document (as in 20261027000400_tax2) plus each line's TrackOja product
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
    insert into public.documents(business_id, kind, number, currency, tax_label, tax_rate, tax2_label, tax2_rate, terms, created_by,
        issue_date, due_date, valid_until)
      values (target, doc_kind, public.next_document_number(target, doc_kind), b.currency, b.tax_label, b.tax_rate, b.tax2_label, b.tax2_rate,
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
    tax2_rate = coalesce((payload->>'tax2_rate')::numeric, tax2_rate),
    tax2_label = coalesce(payload->>'tax2_label', tax2_label),
    prices_include_vat = case when payload ? 'prices_include_vat' then coalesce((payload->>'prices_include_vat')::boolean, false) else prices_include_vat end,
    notes = coalesce(payload->>'notes', notes),
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
        insert into public.document_items(document_id, business_id, description, details, quantity, unit_price_minor, sort_order, vat_category, external_product_id)
          values (d.id, target, trim(item->>'description'), coalesce(item->>'details',''),
            greatest(coalesce((item->>'quantity')::numeric, 1), 0.01),
            greatest(coalesce((item->>'unit_price_minor')::bigint, 0), 0), i,
            case when item->>'vat_category' in ('zero','exempt') then item->>'vat_category' else 'standard' end,
            case when item->>'external_product_id' ~ '^[0-9A-Za-z-]{1,64}$' then item->>'external_product_id' end);
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

-- 2/3: linking ----------------------------------------------------------------

-- the approval page (signed in as an owner or manager): a one-time code
create or replace function public.pos_create_link_code(target uuid, hashed_code text, store text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(target, array['owner','manager']) then
    raise exception 'Only an owner or manager can connect TrackOja';
  end if;
  if coalesce(hashed_code, '') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid code'; end if;
  delete from public.pos_link_codes where expires_at < now() - interval '1 day';
  insert into public.pos_link_codes(business_id, code_hash, store_name, created_by)
    values (target, hashed_code, left(trim(coalesce(store, '')), 120), auth.uid());
end; $$;
revoke all on function public.pos_create_link_code(uuid, text, text) from public, anon;
grant execute on function public.pos_create_link_code(uuid, text, text) to authenticated;

-- TrackOja exchanges the code for a key (POST /api/pos/link). Linking again
-- replaces the business's link and the store's link.
create or replace function public.pos_link(
  hashed_code text, new_key_hash text, new_key_enc text, new_key_hint text, new_store_id uuid, new_store_name text, new_callback_base text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.pos_link_codes%rowtype;
  b public.businesses%rowtype;
  prev record;
  conn_id uuid;
begin
  select * into c from public.pos_link_codes where code_hash = hashed_code for update;
  if not found or c.used_at is not null or c.expires_at < now() then raise exception 'POS400: Code is invalid or expired'; end if;
  update public.pos_link_codes set used_at = now() where id = c.id;
  select * into b from public.businesses where id = c.business_id;
  if not found then raise exception 'POS400: Code is invalid or expired'; end if;
  for prev in update public.pos_connections set revoked_at = now()
      where revoked_at is null and (business_id = c.business_id or store_id = new_store_id) returning business_id, store_name loop
    insert into public.activity(business_id, actor_label, action, detail)
      values (prev.business_id, 'TrackOja POS', 'pos.disconnected', jsonb_build_object('store_name', prev.store_name, 'reason', 'replaced'));
  end loop;
  insert into public.pos_connections(business_id, key_hash, key_enc, key_hint, store_id, store_name, callback_base, created_by)
    values (c.business_id, new_key_hash, new_key_enc, left(coalesce(new_key_hint, ''), 8), new_store_id,
      left(trim(coalesce(nullif(new_store_name, ''), c.store_name)), 120), new_callback_base, c.created_by)
    returning id into conn_id;
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (c.business_id, c.created_by, 'TrackOja POS', 'pos.connected', jsonb_build_object('store_name', left(trim(coalesce(nullif(new_store_name, ''), c.store_name)), 120)));
  return jsonb_build_object('connection_id', conn_id, 'business', jsonb_build_object('id', b.id, 'name', b.name, 'currency', b.currency));
end; $$;
revoke all on function public.pos_link(text, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pos_link(text, text, text, text, uuid, text, text) to service_role;

-- disconnect: an owner or manager in Settings, or TrackOja itself (service role)
create or replace function public.pos_revoke(conn_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.pos_connections%rowtype;
begin
  select * into c from public.pos_connections where id = conn_id for update;
  if not found then raise exception 'Not allowed'; end if;
  if auth.uid() is not null and not public.has_role(c.business_id, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if c.revoked_at is not null then return; end if;
  update public.pos_connections set revoked_at = now() where id = c.id;
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (c.business_id, auth.uid(), case when auth.uid() is null then 'TrackOja POS' else public.actor_label(c.business_id) end,
      'pos.disconnected', jsonb_build_object('store_name', c.store_name));
end; $$;
revoke all on function public.pos_revoke(uuid) from public, anon;
grant execute on function public.pos_revoke(uuid) to authenticated, service_role;

-- 5: importing a sale -----------------------------------------------------------
-- sale: the payload after the API checked and tidied it (lib/pos-core.js
-- normalizeSale): { id, number, created_at, currency, store_name, cashier,
--   customer: {name, phone, email} | null,
--   items: [{ product_id, name, details, quantity (≤ 2 decimals), unit_price_minor, discount_minor, tax_minor }],
--   tax_minor, total_minor,
--   payments: [{ method: cash|pos|bank_transfer|other, amount_minor, reference }]  (credit and change already taken out) }
-- Errors starting "POS422:" mean the sale can't be imported as sent.
create or replace function public.pos_import_sale(conn_id uuid, sale jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.pos_connections%rowtype;
  b public.businesses%rowtype;
  ps public.pos_sales%rowtype;
  d public.documents%rowtype;
  cust public.customers%rowtype;
  ext text := sale->>'id';
  sold_at timestamptz;
  item jsonb;
  pay jsonb;
  i integer := 0;
  q numeric; u bigint; line_tax bigint; line_disc bigint;
  sub bigint; tax bigint; total bigint; disc bigint; base bigint := 0; paid bigint := 0; amt bigint;
  cname text; cphone text; cemail text; digits text;
  store text; who text;
begin
  select * into c from public.pos_connections where id = conn_id and revoked_at is null;
  if not found then raise exception 'POS401: Not connected'; end if;
  if coalesce(ext, '') !~ '^[0-9A-Za-z-]{1,64}$' then raise exception 'POS422: The sale id is missing'; end if;

  -- once per sale: a repeat (or a second request racing this one) gets the same document
  insert into public.pos_sales(business_id, connection_id, external_id) values (c.business_id, c.id, ext)
    on conflict (business_id, external_id) do nothing returning * into ps;
  if ps.id is null then
    select s.* into ps from public.pos_sales s where s.business_id = c.business_id and s.external_id = ext;
    select * into d from public.documents where id = ps.document_id;
    return jsonb_build_object('document_id', d.id, 'number', d.number, 'status', d.status, 'created', false);
  end if;

  select * into b from public.businesses where id = c.business_id;
  if upper(coalesce(sale->>'currency', '')) <> b.currency then
    raise exception 'POS422: This sale is in %, but this Usetally business records %', upper(coalesce(sale->>'currency', '?')), b.currency;
  end if;
  begin
    sold_at := coalesce((sale->>'created_at')::timestamptz, now());
    tax := (sale->>'tax_minor')::bigint;
    total := (sale->>'total_minor')::bigint;
  exception when others then raise exception 'POS422: Check the sale date and amounts';
  end;
  if tax is null or total is null or tax < 0 or total < 0 then raise exception 'POS422: Check the sale amounts'; end if;
  if jsonb_typeof(sale->'items') is distinct from 'array' or jsonb_array_length(sale->'items') = 0 or jsonb_array_length(sale->'items') > 200 then
    raise exception 'POS422: A sale needs between 1 and 200 items';
  end if;

  -- the customer: an existing one with the same email or phone, or a new one
  cname := left(trim(coalesce(sale->'customer'->>'name', '')), 120);
  cphone := left(trim(coalesce(sale->'customer'->>'phone', '')), 40);
  cemail := lower(left(trim(coalesce(sale->'customer'->>'email', '')), 200));
  digits := regexp_replace(cphone, '\D', '', 'g');
  if cname <> '' then
    select * into cust from public.customers
      where business_id = b.id and archived_at is null
        and ((cemail <> '' and lower(email) = cemail) or (char_length(digits) >= 7 and regexp_replace(phone, '\D', '', 'g') = digits))
      order by created_at limit 1;
    if not found then
      insert into public.customers(business_id, name, email, phone, notes)
        values (b.id, cname, cemail, cphone, 'Added from TrackOja POS') returning * into cust;
    end if;
  end if;

  store := left(trim(coalesce(nullif(sale->>'store_name', ''), c.store_name)), 120);
  who := left(trim(coalesce(sale->>'cashier', '')), 80);
  insert into public.documents(business_id, kind, number, title, customer_id, customer_name, customer_company, customer_email,
      customer_phone, customer_address, currency, status, issue_date, due_date, tax_label, tax_rate, notes, terms,
      sent_at, counted_toward_allowance, source, source_ref)
    values (b.id, 'invoice', public.next_document_number(b.id, 'invoice'),
      'POS sale #' || left(coalesce(nullif(trim(sale->>'number'), ''), left(ext, 8)), 40),
      cust.id, coalesce(cust.name, 'Walk-in customer'), coalesce(cust.company, ''), coalesce(cust.email, ''), coalesce(cust.phone, ''), coalesce(cust.address, ''),
      b.currency, 'sent', (sold_at at time zone 'Africa/Lagos')::date, (sold_at at time zone 'Africa/Lagos')::date,
      coalesce(nullif(b.tax_label, ''), 'Tax'), 0,
      concat_ws(' · ', 'TrackOja POS sale', nullif('Sold at ' || store, 'Sold at '), nullif('Cashier: ' || who, 'Cashier: ')), '',
      sold_at, false, 'pos', ext)
    returning * into d;

  for item in select * from jsonb_array_elements(sale->'items') loop
    begin
      q := (item->>'quantity')::numeric;
      u := (item->>'unit_price_minor')::bigint;
      line_tax := coalesce((item->>'tax_minor')::bigint, 0);
      line_disc := coalesce((item->>'discount_minor')::bigint, 0);
    exception when others then raise exception 'POS422: Check item % quantity and price', i + 1;
    end;
    if q is null or q <= 0 or q <> round(q, 2) or q >= 10000000000 or u is null or u < 0 or line_tax < 0 or line_disc < 0 then
      raise exception 'POS422: Check item % quantity and price', i + 1;
    end if;
    insert into public.document_items(document_id, business_id, description, details, quantity, unit_price_minor, sort_order, vat_category, external_product_id)
      values (d.id, b.id, left(coalesce(nullif(trim(item->>'name'), ''), 'Item'), 300), left(coalesce(item->>'details', ''), 1000), q, u, i,
        -- a line TrackOja didn't tax, in a sale with tax, is 0% (zero-rated)
        case when tax > 0 and line_tax = 0 then 'zero' else 'standard' end,
        case when item->>'product_id' ~ '^[0-9A-Za-z-]{1,64}$' then item->>'product_id' end);
    if line_tax > 0 then base := base + round(q * u)::bigint - line_disc; end if;
    i := i + 1;
  end loop;

  -- TrackOja's total is the total. Line and sale discounts become the
  -- document discount; tax is TrackOja's tax; the rate shown is the effective one.
  select coalesce(sum(round(quantity * unit_price_minor)), 0)::bigint into sub from public.document_items where document_id = d.id;
  disc := sub + tax - total;
  if disc < 0 or disc > sub then raise exception 'POS422: The sale total doesn''t match its items'; end if;
  update public.documents set subtotal_minor = sub, discount_minor = disc, tax_minor = tax, tax2_minor = 0, total_minor = total,
    tax_rate = case when tax > 0 and base > 0 then least(round(tax * 100.0 / base, 3), 100) else 0 end,
    status = case when total = 0 then 'paid' else status end, paid_at = case when total = 0 then sold_at end
    where id = d.id;

  -- money taken at the till: each payment issues a receipt; credit stays due
  for pay in select * from jsonb_array_elements(coalesce(sale->'payments', '[]'::jsonb)) loop
    begin amt := (pay->>'amount_minor')::bigint;
    exception when others then raise exception 'POS422: Check the payment amounts';
    end;
    if coalesce(pay->>'method', '') not in ('cash', 'pos', 'bank_transfer', 'other') then raise exception 'POS422: Unknown payment method'; end if;
    if amt is null or amt < 0 then raise exception 'POS422: Check the payment amounts'; end if;
    if amt > 0 then
      if paid + amt > total then raise exception 'POS422: The payments are more than the sale total'; end if;
      perform public.apply_payment(d.id, pay->>'method', left(coalesce(pay->>'reference', ''), 120), amt, b.currency,
        'TrackOja POS', null, null, sold_at);
      paid := paid + amt;
    end if;
  end loop;
  update public.receipts set issued_at = sold_at where document_id = d.id;
  update public.activity set actor_label = 'TrackOja POS' where document_id = d.id and action = 'payment.recorded';
  update public.documents set paid_at = case when status = 'paid' then sold_at end where id = d.id returning * into d;

  insert into public.activity(business_id, document_id, actor_label, action, detail)
    values (b.id, d.id, 'TrackOja POS', 'pos.sale_imported', jsonb_build_object('sale', sale->>'number', 'store', store, 'cashier', who,
      'total_minor', total, 'paid_minor', paid));
  update public.pos_sales set document_id = d.id where id = ps.id;
  update public.pos_connections set last_used_at = now() where id = c.id;
  return jsonb_build_object('document_id', d.id, 'number', d.number, 'status', d.status, 'created', true);
end; $$;
revoke all on function public.pos_import_sale(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pos_import_sale(uuid, jsonb) to service_role;

-- a sale voided in TrackOja: the invoice is voided here. Its payments and
-- receipts are removed (the money went back at the till; they were never sent
-- to anyone) and the activity log keeps what was removed. Null = never imported.
create or replace function public.pos_void_sale(conn_id uuid, ext text, reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.pos_connections%rowtype;
  ps public.pos_sales%rowtype;
  d public.documents%rowtype;
  rcpts jsonb;
begin
  select * into c from public.pos_connections where id = conn_id and revoked_at is null;
  if not found then raise exception 'POS401: Not connected'; end if;
  select * into ps from public.pos_sales where business_id = c.business_id and external_id = ext for update;
  if not found then return null; end if;
  select * into d from public.documents where id = ps.document_id for update;
  if not found then return null; end if;
  if d.status <> 'void' then
    select coalesce(jsonb_agg(number order by number), '[]'::jsonb) into rcpts from public.receipts where document_id = d.id;
    delete from public.payments where document_id = d.id;
    update public.documents set status = 'void', voided_at = now(), amount_paid_minor = 0, paid_at = null, updated_at = now()
      where id = d.id returning * into d;
    insert into public.activity(business_id, document_id, actor_label, action, detail)
      values (d.business_id, d.id, 'TrackOja POS', 'pos.sale_voided',
        jsonb_build_object('reason', left(trim(coalesce(reason, '')), 500), 'receipts_removed', rcpts));
  end if;
  update public.pos_sales set status = 'voided', voided_at = coalesce(voided_at, now()) where id = ps.id;
  update public.pos_connections set last_used_at = now() where id = c.id;
  return jsonb_build_object('document_id', d.id, 'number', d.number, 'status', d.status);
end; $$;
revoke all on function public.pos_void_sale(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pos_void_sale(uuid, text, text) to service_role;

revoke all on function public.fill_item_external_product() from public, anon, authenticated;
revoke all on function public.queue_pos_stock_push() from public, anon, authenticated;
