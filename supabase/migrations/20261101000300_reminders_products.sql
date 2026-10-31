-- Usetally: invoice reminders, a products catalogue, and two invoice
-- defaults. Safe to run more than once.
--
--  1. businesses.email_template_invoice: the default message sent with an
--     invoice ({client} {amount} {due_date} {link} are filled in). Used by the
--     send sheet when set. businesses.reminders_enabled: one switch for all.
--  2. reminder_rules: per business, days relative to the due date (-3 = three
--     days before, 0 = on the day, 7 = a week after), each on/off with its own
--     subject and message. Three defaults for every business.
--  3. reminder_log: one row per invoice per rule once sent, so the daily job
--     never sends the same reminder twice. due_reminders(as_of) lists what is
--     due; only the server (service role) calls it.
--     "Overdue" stays derived (unpaid and past the due date), as everywhere
--     else in the app; nothing is stored for it.
--  4. products: saved items (name, description, unit, price, VAT category)
--     that the invoice editor suggests. Members read; owners, managers and
--     finance edit.

-- 1 -------------------------------------------------------------------------
alter table public.businesses add column if not exists email_template_invoice text not null default '';
alter table public.businesses add column if not exists reminders_enabled boolean not null default true;
do $$ begin
  alter table public.businesses add constraint businesses_email_template_len check (char_length(email_template_invoice) <= 2000);
exception when duplicate_object then null; end $$;

-- 2 -------------------------------------------------------------------------
create table if not exists public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  offset_days integer not null check (offset_days between -30 and 90),
  enabled boolean not null default true,
  subject text not null default '' check (char_length(subject) <= 160),
  message text not null default '' check (char_length(message) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, offset_days)
);
create index if not exists reminder_rules_business_idx on public.reminder_rules(business_id);
alter table public.reminder_rules enable row level security;
drop policy if exists "members read reminder rules" on public.reminder_rules;
create policy "members read reminder rules" on public.reminder_rules for select using (public.is_member(business_id));
drop policy if exists "managers edit reminder rules" on public.reminder_rules;
create policy "managers edit reminder rules" on public.reminder_rules for all
  using (public.has_role(business_id, array['owner','manager'])) with check (public.has_role(business_id, array['owner','manager']));
grant select, insert, update, delete on public.reminder_rules to authenticated;
grant all on public.reminder_rules to service_role;

-- the three defaults, for a business that has none yet
create or replace function public.seed_reminder_rules(target uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.reminder_rules(business_id, offset_days, enabled, subject, message)
  select target, v.d, true, v.s, v.m from (values
    (-3, 'Reminder: invoice {number} is due on {due_date}',
         'Hi {client},' || chr(10) || chr(10) || 'A friendly reminder that invoice {number} for {amount} is due on {due_date}. You can view and pay it here: {link}' || chr(10) || chr(10) || 'Thank you.'),
    (0,  'Invoice {number} is due today',
         'Hi {client},' || chr(10) || chr(10) || 'Invoice {number} for {amount} is due today. You can view and pay it here: {link}' || chr(10) || chr(10) || 'Thank you.'),
    (7,  'Invoice {number} is now overdue',
         'Hi {client},' || chr(10) || chr(10) || 'Invoice {number} for {amount} was due on {due_date} and is still unpaid. Please pay it here: {link}' || chr(10) || chr(10) || 'If you have already paid, thank you, and please ignore this message.')
  ) as v(d, s, m)
  where not exists (select 1 from public.reminder_rules r where r.business_id = target);
$$;
revoke all on function public.seed_reminder_rules(uuid) from public, anon, authenticated;
grant execute on function public.seed_reminder_rules(uuid) to service_role;

create or replace function public.seed_reminder_rules_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_reminder_rules(new.id);
  return new;
end; $$;
revoke all on function public.seed_reminder_rules_on_insert() from public, anon, authenticated;
drop trigger if exists businesses_seed_reminders on public.businesses;
create trigger businesses_seed_reminders after insert on public.businesses for each row execute function public.seed_reminder_rules_on_insert();

-- existing businesses get the defaults once
do $$ declare b record; begin
  for b in select id from public.businesses where not exists (select 1 from public.reminder_rules r where r.business_id = businesses.id) loop
    perform public.seed_reminder_rules(b.id);
  end loop;
end $$;

-- 3 -------------------------------------------------------------------------
create table if not exists public.reminder_log (
  document_id uuid not null references public.documents(id) on delete cascade,
  rule_id uuid not null references public.reminder_rules(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  detail text not null default '',
  primary key (document_id, rule_id)
);
create index if not exists reminder_log_business_idx on public.reminder_log(business_id, sent_at desc);
alter table public.reminder_log enable row level security;
drop policy if exists "members read reminder log" on public.reminder_log;
create policy "members read reminder log" on public.reminder_log for select using (public.is_member(business_id));
revoke all on public.reminder_log from anon, authenticated;
grant select on public.reminder_log to authenticated;
grant all on public.reminder_log to service_role;

-- unpaid invoices with an email whose reminder date is today or in the last
-- 3 days (so a missed daily run still catches up) and that weren't sent yet
create or replace function public.due_reminders(as_of date default (now() at time zone 'Africa/Lagos')::date, max_rows integer default 200)
returns table (document_id uuid, rule_id uuid, business_id uuid, offset_days integer)
language sql stable security definer set search_path = public as $$
  select d.id, r.id, d.business_id, r.offset_days
  from public.documents d
  join public.businesses b on b.id = d.business_id and b.reminders_enabled
  join public.reminder_rules r on r.business_id = d.business_id and r.enabled
  where d.kind = 'invoice'
    and d.status in ('sent', 'viewed', 'partially_paid')
    and d.due_date is not null
    and d.customer_email <> ''
    and d.due_date + r.offset_days <= as_of
    and d.due_date + r.offset_days > as_of - 3
    and not exists (select 1 from public.reminder_log l where l.document_id = d.id and l.rule_id = r.id)
  order by d.due_date, r.offset_days
  limit greatest(1, least(max_rows, 1000));
$$;
revoke all on function public.due_reminders(date, integer) from public, anon, authenticated;
grant execute on function public.due_reminders(date, integer) to service_role;

-- 4 -------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  description text not null default '' check (char_length(description) <= 1000),
  unit text not null default '' check (char_length(unit) <= 20),
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  vat_category text not null default 'standard' check (vat_category in ('standard', 'zero', 'exempt')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_business_name_idx on public.products(business_id, lower(name)) where archived_at is null;
alter table public.products enable row level security;
drop policy if exists "members read products" on public.products;
create policy "members read products" on public.products for select using (public.is_member(business_id));
drop policy if exists "finance edits products" on public.products;
create policy "finance edits products" on public.products for all
  using (public.has_role(business_id, array['owner','manager','finance'])) with check (public.has_role(business_id, array['owner','manager','finance']));
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
