-- Usetally: every database update from 27 Oct to 29 Oct in one file, in order.
-- Safe to run more than once (each part checks what's already there).
-- Already ran RUN_NEW_2026-10-29a.sql (TrackOja POS)? It isn't needed again.


-- ================= RUN_NEW_2026-10-27d.sql =================
-- Usetally: tax that fits each country. Safe to run more than once.
--
--  1. Rates with three decimals (Québec's QST is 9.975%).
--  2. A second tax on businesses and documents, for places that charge two
--     (Canada: GST + PST, GST + QST, GST + RST). It's shown as its own line.
--     documents.tax_minor stays the TOTAL tax; tax2_minor is the second tax's
--     share of it, so "before tax" (total - tax_minor) is unchanged everywhere.
--  3. A region on the business (e.g. a Canadian province), which picks the
--     suggested rates.

alter table public.businesses alter column tax_rate type numeric(6,3);
alter table public.documents alter column tax_rate type numeric(6,3);

alter table public.businesses add column if not exists region text not null default '';
alter table public.businesses add column if not exists tax2_label text not null default '';
alter table public.businesses add column if not exists tax2_rate numeric(6,3) not null default 0;
alter table public.documents add column if not exists tax2_label text not null default '';
alter table public.documents add column if not exists tax2_rate numeric(6,3) not null default 0;
alter table public.documents add column if not exists tax2_minor bigint not null default 0;
do $$ begin
  alter table public.businesses add constraint businesses_tax2_rate check (tax2_rate between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents add constraint documents_tax2_rate check (tax2_rate between 0 and 100);
exception when duplicate_object then null; end $$;

-- totals: both taxes on standard-rated lines, after their share of the
-- discount. With tax-inclusive prices the taxes are the part already inside
-- those prices, split by rate.
create or replace function public.recalculate_document(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  sub bigint; std bigint; disc bigint; std_after numeric; tax bigint; tax2 bigint; total bigint; r numeric;
begin
  select * into d from public.documents where id = target for update;
  if not found then return; end if;
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

-- an invoice made from a quote (accepted, or paid) keeps the quote's
-- "prices include tax" choice and its second tax
create or replace function public.copy_prices_include_vat() returns trigger
language plpgsql security definer set search_path = public as $$
declare q public.documents%rowtype;
begin
  if new.source_quote_id is not null then
    select * into q from public.documents where id = new.source_quote_id;
    if found then
      new.prices_include_vat := coalesce(q.prices_include_vat, false);
      new.tax2_label := coalesce(q.tax2_label, '');
      new.tax2_rate := coalesce(q.tax2_rate, 0);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists documents_prices_include_vat on public.documents;
create trigger documents_prices_include_vat before insert on public.documents for each row execute function public.copy_prices_include_vat();

-- new documents start with the business's taxes; drafts can change both
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


-- ================= RUN_NEW_2026-10-27e.sql =================
-- Usetally: limits against bots and password guessing. Safe to run more than once.
-- A counter per key (a hash of an IP address or email, plus what's being
-- done) per time window. Only the server (service role) uses it.
create table if not exists public.rate_hits (
  key text not null,
  bucket timestamptz not null,
  hits integer not null default 0,
  primary key (key, bucket)
);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;
grant select, insert, update, delete on public.rate_hits to service_role;

-- counts one hit; true while the key is within max_hits for this window
create or replace function public.rate_hit(hit_key text, window_seconds integer, max_hits integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  b timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(window_seconds, 1)) * greatest(window_seconds, 1));
  n integer;
begin
  insert into public.rate_hits(key, bucket, hits) values (left(hit_key, 200), b, 1)
    on conflict (key, bucket) do update set hits = public.rate_hits.hits + 1
    returning hits into n;
  -- tidy up now and then
  if random() < 0.02 then delete from public.rate_hits where bucket < now() - interval '2 days'; end if;
  return n <= max_hits;
end; $$;
revoke all on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;


-- ================= RUN_NEW_2026-10-28a.sql =================
-- Usetally: ad performance (Admin → Marketing). Safe to run more than once.
--  1. Which ad each business came from (UTM tags and Meta's click IDs, saved
--     when the business is created), plus the browser details Meta needs to
--     match a later payment to the ad.
--  2. Each Meta ad's results per day (synced every 6 hours).
--  3. The thresholds for the verdicts, the Meta connection and report email.
--  4. A log of the reports sent.
-- Only platform admins can read these; the sync job writes with the service key.

alter table public.businesses add column if not exists utm_source text;
alter table public.businesses add column if not exists utm_medium text;
alter table public.businesses add column if not exists utm_campaign text;
alter table public.businesses add column if not exists utm_content text;
alter table public.businesses add column if not exists utm_term text;
alter table public.businesses add column if not exists fbclid text;
alter table public.businesses add column if not exists fbc text;
alter table public.businesses add column if not exists fbp text;
alter table public.businesses add column if not exists first_landing_url text;
alter table public.businesses add column if not exists landed_at timestamptz;
alter table public.businesses add column if not exists attr_last jsonb;          -- the last ad touch before signing up
alter table public.businesses add column if not exists attr_ip text;            -- for Meta to match a later payment
alter table public.businesses add column if not exists attr_user_agent text;
create index if not exists businesses_utm on public.businesses(utm_content, utm_campaign);

create table if not exists public.ad_insights (
  date date not null,
  ad_id text not null,
  ad_name text not null default '',
  adset_name text not null default '',
  campaign_name text not null default '',
  utm_campaign text,
  utm_content text,
  country text,
  spend numeric(14,2) not null default 0,
  currency text not null default '',
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  meta_registrations bigint not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, ad_id)
);
create index if not exists ad_insights_utm on public.ad_insights(utm_content);

create table if not exists public.marketing_settings (
  id boolean primary key default true check (id),
  kill_spend_no_signup numeric(14,2) not null default 3000,
  max_cost_per_signup numeric(14,2) not null default 1500,
  scale_min_signups integer not null default 3,
  ngn_per_usd numeric(14,2) not null default 1500,
  report_email text,
  reports_enabled boolean not null default true,
  -- the Meta connection, set in the dashboard (tokens encrypted by the app)
  meta_ad_account_id text,
  meta_pixel_id text,
  meta_access_token_enc text,
  meta_access_token_hint text,
  meta_capi_token_enc text,
  meta_capi_token_hint text,
  last_sync_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now()
);
insert into public.marketing_settings(id, meta_ad_account_id) values (true, '2167224513581774') on conflict (id) do nothing;

create table if not exists public.marketing_reports (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  period text not null default '6h',
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent', 'skipped', 'error'))
);
create index if not exists marketing_reports_recent on public.marketing_reports(sent_at desc);

alter table public.ad_insights enable row level security;
alter table public.marketing_settings enable row level security;
alter table public.marketing_reports enable row level security;
revoke all on public.ad_insights, public.marketing_settings, public.marketing_reports from anon;
grant select, insert, update, delete on public.ad_insights, public.marketing_settings, public.marketing_reports to authenticated, service_role;

do $$ begin
  create policy ad_insights_admin on public.ad_insights for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy marketing_settings_admin on public.marketing_settings for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy marketing_reports_admin on public.marketing_reports for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
exception when duplicate_object then null; end $$;

-- the attribution columns are set by the server only: members can't fake
-- where their business came from
create or replace function public.protect_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('role', true) = 'authenticated' and not public.is_platform_admin() then
    new.utm_source := old.utm_source; new.utm_medium := old.utm_medium; new.utm_campaign := old.utm_campaign;
    new.utm_content := old.utm_content; new.utm_term := old.utm_term; new.fbclid := old.fbclid; new.fbc := old.fbc; new.fbp := old.fbp;
    new.first_landing_url := old.first_landing_url; new.landed_at := old.landed_at; new.attr_last := old.attr_last;
    new.attr_ip := old.attr_ip; new.attr_user_agent := old.attr_user_agent;
  end if;
  return new;
end; $$;
drop trigger if exists businesses_protect_attribution on public.businesses;
create trigger businesses_protect_attribution before update on public.businesses for each row execute function public.protect_attribution();


-- ================= RUN_NEW_2026-10-29b.sql =================
-- Usetally: "Ideas & help" (feature requests and messages to the team) and
-- time spent in the app by area. Safe to run more than once.
--
--  1. feedback_threads / feedback_messages: a person starts a thread from the
--     app (a feature idea, a problem, a question); the platform team replies
--     from Admin → Inbox. People see only their own threads; platform admins
--     see all. Everything goes through the functions below.
--  2. usage_daily: active seconds per person, business, day (Lagos) and app
--     area (e.g. /app/invoices/:id). Counted only while the tab is visible and
--     the person was active in the last 2 minutes. No page content, no
--     keystrokes. Members never read it; platform admins read it in Admin.

-- 1 -------------------------------------------------------------------------
create table if not exists public.feedback_threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 120),
  author_email text not null default '' check (char_length(author_email) <= 200),
  kind text not null default 'feature' check (kind in ('feature', 'problem', 'question', 'other')),
  subject text not null check (char_length(subject) between 3 and 140),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'closed')),
  page text not null default '' check (char_length(page) <= 200),
  unread_admin boolean not null default true,
  unread_user boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index if not exists feedback_threads_user_idx on public.feedback_threads(user_id, last_message_at desc);
create index if not exists feedback_threads_inbox_idx on public.feedback_threads(status, last_message_at desc);

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.feedback_threads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  from_team boolean not null default false,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists feedback_messages_thread_idx on public.feedback_messages(thread_id, created_at);

alter table public.feedback_threads enable row level security;
alter table public.feedback_messages enable row level security;
drop policy if exists "own or team reads threads" on public.feedback_threads;
create policy "own or team reads threads" on public.feedback_threads for select
  using (user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "own or team reads messages" on public.feedback_messages;
create policy "own or team reads messages" on public.feedback_messages for select
  using (exists (select 1 from public.feedback_threads t where t.id = thread_id and (t.user_id = auth.uid() or public.is_platform_admin())));
revoke all on public.feedback_threads, public.feedback_messages from anon, authenticated;
grant select on public.feedback_threads, public.feedback_messages to authenticated;
grant all on public.feedback_threads, public.feedback_messages to service_role;

-- a person starts a thread (at most 10 a day)
create or replace function public.feedback_start(target uuid, kind text, subject text, body text, page text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid; who text; mail text;
begin
  if auth.uid() is null then raise exception 'Sign in to send a message'; end if;
  if target is not null and not public.is_member(target) then raise exception 'Not allowed'; end if;
  if kind not in ('feature', 'problem', 'question', 'other') then raise exception 'Choose what this is about'; end if;
  if char_length(trim(coalesce(subject, ''))) < 3 then raise exception 'Add a short title (at least 3 characters)'; end if;
  if char_length(trim(coalesce(body, ''))) < 1 then raise exception 'Write your message'; end if;
  if (select count(*) from public.feedback_threads where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have sent a lot today. Add to an existing conversation, or try again tomorrow.';
  end if;
  select coalesce(nullif(m.full_name, ''), ''), coalesce(u.email, '') into who, mail
    from auth.users u left join public.memberships m on m.user_id = u.id and m.business_id = target where u.id = auth.uid();
  insert into public.feedback_threads(business_id, user_id, author_name, author_email, kind, subject, page)
    values (target, auth.uid(), left(coalesce(who, ''), 120), left(coalesce(mail, ''), 200), kind, left(trim(subject), 140), left(coalesce(page, ''), 200))
    returning id into t;
  insert into public.feedback_messages(thread_id, author_id, from_team, body) values (t, auth.uid(), false, left(trim(body), 5000));
  return t;
end; $$;

-- the person or the team replies; a team reply marks it unread for the person
create or replace function public.feedback_reply(thread uuid, body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare th public.feedback_threads%rowtype; team boolean := public.is_platform_admin();
begin
  select * into th from public.feedback_threads where id = thread for update;
  if not found or (th.user_id <> auth.uid() and not team) then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(body, ''))) < 1 then raise exception 'Write your message'; end if;
  if not team and (select count(*) from public.feedback_messages where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Try again in a little while.';
  end if;
  -- an admin writing in their own thread speaks as themselves
  team := team and th.user_id <> auth.uid();
  insert into public.feedback_messages(thread_id, author_id, from_team, body) values (th.id, auth.uid(), team, left(trim(body), 5000));
  update public.feedback_threads set last_message_at = now(),
      unread_admin = case when team then false else true end,
      unread_user = case when team then true else false end,
      status = case when not team and status in ('done', 'closed') then 'open' else status end
    where id = th.id;
  return jsonb_build_object('from_team', team, 'user_id', th.user_id, 'email', th.author_email, 'name', th.author_name, 'subject', th.subject);
end; $$;

create or replace function public.feedback_set_status(thread uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if new_status not in ('open', 'planned', 'done', 'closed') then raise exception 'Unknown status'; end if;
  update public.feedback_threads set status = new_status where id = thread;
end; $$;

-- opening a thread marks it read for whoever opened it
create or replace function public.feedback_mark_read(thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_threads set unread_user = false where id = thread and user_id = auth.uid();
  if public.is_platform_admin() then update public.feedback_threads set unread_admin = false where id = thread and user_id <> auth.uid(); end if;
end; $$;

revoke all on function public.feedback_start(uuid, text, text, text, text) from public, anon;
revoke all on function public.feedback_reply(uuid, text) from public, anon;
revoke all on function public.feedback_set_status(uuid, text) from public, anon;
revoke all on function public.feedback_mark_read(uuid) from public, anon;
grant execute on function public.feedback_start(uuid, text, text, text, text) to authenticated;
grant execute on function public.feedback_reply(uuid, text) to authenticated;
grant execute on function public.feedback_set_status(uuid, text) to authenticated;
grant execute on function public.feedback_mark_read(uuid) to authenticated;

-- 2 -------------------------------------------------------------------------
create table if not exists public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  area text not null check (area ~ '^/[a-z0-9/:_-]{0,79}$'),
  seconds integer not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, business_id, day, area)
);
create index if not exists usage_daily_day_idx on public.usage_daily(day);
create index if not exists usage_daily_business_idx on public.usage_daily(business_id, day);
alter table public.usage_daily enable row level security;
drop policy if exists "team reads usage" on public.usage_daily;
create policy "team reads usage" on public.usage_daily for select using (public.is_platform_admin());
revoke all on public.usage_daily from anon, authenticated;
grant select on public.usage_daily to authenticated;
grant all on public.usage_daily to service_role;

-- adds active time for the signed-in member: at most 5 minutes per call and
-- 16 hours a day per person, so a stuck tab can't inflate the numbers
create or replace function public.usage_add(target uuid, area_path text, secs integer)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Africa/Lagos')::date; total integer;
begin
  if auth.uid() is null or not public.is_member(target) then return; end if;
  if secs is null or secs <= 0 or coalesce(area_path, '') !~ '^/[a-z0-9/:_-]{0,79}$' then return; end if;
  select coalesce(sum(seconds), 0) into total from public.usage_daily where user_id = auth.uid() and day = d;
  secs := least(secs, 300, greatest(0, 57600 - total));
  if secs <= 0 then return; end if;
  insert into public.usage_daily(user_id, business_id, day, area, seconds) values (auth.uid(), target, d, area_path, secs)
    on conflict (user_id, business_id, day, area) do update set seconds = public.usage_daily.seconds + excluded.seconds, updated_at = now();
end; $$;
revoke all on function public.usage_add(uuid, text, integer) from public, anon;
grant execute on function public.usage_add(uuid, text, integer) to authenticated;


-- ================= RUN_NEW_2026-10-29c.sql =================
-- Ideas & help, part 2: messages from TrackOja land in the same Admin → Inbox.
-- Needs RUN_NEW_2026-10-29b.sql first. Safe to run more than once.
--
-- A TrackOja thread has source = 'trackoja', no Usetally user, and the
-- TrackOja user's id in external_user_id. Only the platform team can read it
-- here; TrackOja reads and writes it through /api/support/trackoja (server to
-- server, with a shared secret), calling the external_* functions below.

alter table public.feedback_threads add column if not exists source text not null default 'usetally';
alter table public.feedback_threads add column if not exists external_user_id text;
alter table public.feedback_threads add column if not exists origin_label text not null default '';
alter table public.feedback_threads alter column user_id drop not null;
do $$ begin
  alter table public.feedback_threads add constraint feedback_threads_source check (
    (source = 'usetally' and user_id is not null) or
    (source = 'trackoja' and external_user_id ~ '^[0-9A-Za-z-]{1,64}$'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.feedback_threads add constraint feedback_threads_origin_label check (char_length(origin_label) <= 120);
exception when duplicate_object then null; end $$;
create index if not exists feedback_threads_external_idx on public.feedback_threads(source, external_user_id, last_message_at desc) where source <> 'usetally';

-- replies: null-safe now that a thread may have no Usetally user
create or replace function public.feedback_reply(thread uuid, body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare th public.feedback_threads%rowtype; team boolean := public.is_platform_admin();
begin
  select * into th from public.feedback_threads where id = thread for update;
  if not found or (not coalesce(th.user_id = auth.uid(), false) and not team) then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(body, ''))) < 1 then raise exception 'Write your message'; end if;
  if not team and (select count(*) from public.feedback_messages where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Try again in a little while.';
  end if;
  team := team and th.user_id is distinct from auth.uid();
  insert into public.feedback_messages(thread_id, author_id, from_team, body) values (th.id, auth.uid(), team, left(trim(body), 5000));
  update public.feedback_threads set last_message_at = now(),
      unread_admin = not team, unread_user = team,
      status = case when not team and status in ('done', 'closed') then 'open' else status end
    where id = th.id;
  return jsonb_build_object('from_team', team, 'user_id', th.user_id, 'email', th.author_email, 'name', th.author_name,
    'subject', th.subject, 'source', th.source);
end; $$;

create or replace function public.feedback_mark_read(thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.feedback_threads set unread_user = false where id = thread and user_id = auth.uid();
  if public.is_platform_admin() then update public.feedback_threads set unread_admin = false where id = thread and user_id is distinct from auth.uid(); end if;
end; $$;

-- TrackOja (service role only) -------------------------------------------------

create or replace function public.feedback_external_start(ext_user text, name text, email text, store text,
  kind text, subject text, body text, page text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if coalesce(ext_user, '') !~ '^[0-9A-Za-z-]{1,64}$' then raise exception 'FB400: Unknown user'; end if;
  if kind not in ('feature', 'problem', 'question', 'other') then raise exception 'FB400: Choose what this is about'; end if;
  if char_length(trim(coalesce(subject, ''))) < 3 then raise exception 'FB400: Add a short title (at least 3 characters)'; end if;
  if char_length(trim(coalesce(body, ''))) < 1 then raise exception 'FB400: Write your message'; end if;
  if (select count(*) from public.feedback_threads where source = 'trackoja' and external_user_id = ext_user and created_at > now() - interval '1 day') >= 10 then
    raise exception 'FB429: You have sent a lot today. Add to an existing conversation, or try again tomorrow.';
  end if;
  insert into public.feedback_threads(source, external_user_id, author_name, author_email, origin_label, kind, subject, page)
    values ('trackoja', ext_user, left(trim(coalesce(name, '')), 120), left(lower(trim(coalesce(email, ''))), 200),
      left(trim(coalesce(store, '')), 120), kind, left(trim(subject), 140), left(coalesce(page, ''), 200))
    returning id into t;
  insert into public.feedback_messages(thread_id, from_team, body) values (t, false, left(trim(body), 5000));
  return t;
end; $$;

create or replace function public.feedback_external_reply(thread uuid, ext_user text, body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare th public.feedback_threads%rowtype;
begin
  select * into th from public.feedback_threads where id = thread and source = 'trackoja' and external_user_id = ext_user for update;
  if not found then raise exception 'FB404: Conversation not found'; end if;
  if char_length(trim(coalesce(body, ''))) < 1 then raise exception 'FB400: Write your message'; end if;
  if (select count(*) from public.feedback_messages m join public.feedback_threads x on x.id = m.thread_id
      where x.source = 'trackoja' and x.external_user_id = ext_user and not m.from_team and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'FB429: Too many messages. Try again in a little while.';
  end if;
  insert into public.feedback_messages(thread_id, from_team, body) values (th.id, false, left(trim(body), 5000));
  update public.feedback_threads set last_message_at = now(), unread_admin = true, unread_user = false,
      status = case when status in ('done', 'closed') then 'open' else status end
    where id = th.id;
  return jsonb_build_object('subject', th.subject, 'name', th.author_name, 'email', th.author_email, 'store', th.origin_label);
end; $$;

create or replace function public.feedback_external_read(thread uuid, ext_user text)
returns void language sql security definer set search_path = public as $$
  update public.feedback_threads set unread_user = false where id = thread and source = 'trackoja' and external_user_id = ext_user;
$$;

revoke all on function public.feedback_external_start(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.feedback_external_reply(uuid, text, text) from public, anon, authenticated;
revoke all on function public.feedback_external_read(uuid, text) from public, anon, authenticated;
grant execute on function public.feedback_external_start(text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.feedback_external_reply(uuid, text, text) to service_role;
grant execute on function public.feedback_external_read(uuid, text) to service_role;

