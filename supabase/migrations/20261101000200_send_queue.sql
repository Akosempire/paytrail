-- Usetally: the send sheet. Safe to run more than once.
--
--  1. document_sends: every invoice email waits here before it goes. "Send
--     now" waits 10 seconds so it can be undone; "Schedule…" waits until the
--     chosen time. The server picks due rows with claim_due_sends() (also
--     from the daily job, so nothing is lost if the app restarts) and reports
--     back with finish_document_send(). Members read; all writes go through
--     the functions below.
--  2. record_document_share(): WhatsApp, link, QR and PDF shares show in the
--     activity with their channel.
--  3. Recurring invoices: documents.recur_* columns. run_due_recurrences()
--     (daily job, service role) makes one draft copy per invoice per period;
--     a unique index on (recur_source_id, recur_period) makes a second run in
--     the same period do nothing. With auto-send on, the copy is queued to go
--     to the client.
--  4. documents.view_notified_at: the business is told at most once a day per
--     invoice that their client opened it (claim_view_notice()).

-- 1 -------------------------------------------------------------------------
create table if not exists public.document_sends (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  kind text not null default 'now' check (kind in ('now', 'scheduled', 'recurring')),
  to_email text not null check (char_length(to_email) between 3 and 254),
  cc text[] not null default '{}' check (cardinality(cc) <= 5),
  subject text not null default '' check (char_length(subject) <= 200),
  message text not null default '' check (char_length(message) <= 4000),
  include_pdf boolean not null default true,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'cancelled', 'failed')),
  send_after timestamptz not null default now(),
  mark_on_send boolean not null default false,
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  error text not null default '' check (char_length(error) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_sends_due_idx on public.document_sends(send_after) where status in ('queued', 'sending');
create index if not exists document_sends_document_idx on public.document_sends(document_id, created_at desc);
alter table public.document_sends enable row level security;
drop policy if exists "members read sends" on public.document_sends;
create policy "members read sends" on public.document_sends for select using (public.is_member(business_id));
revoke all on public.document_sends from anon, authenticated;
grant select on public.document_sends to authenticated;
grant all on public.document_sends to service_role;

-- who did it, for the activity list, when the server acts for a person
create or replace function public.actor_label_for(target uuid, who uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(full_name, ''), email) from public.memberships where business_id = target and user_id = who), 'Usetally');
$$;
revoke all on function public.actor_label_for(uuid, uuid) from public, anon, authenticated;

-- the same rule as mark_document_sent: who may send this document
create or replace function public.check_can_send(d public.documents) returns void
language plpgsql stable security definer set search_path = public as $$
declare my_role text := public.member_role(d.business_id);
begin
  if my_role is null then raise exception 'Document not found'; end if;
  if my_role = 'junior_finance' and d.status in ('draft', 'pending_approval')
     and (select require_approval from public.businesses where id = d.business_id) then
    raise exception 'A manager or finance officer needs to approve this before it is sent';
  end if;
  if d.status = 'void' then raise exception 'This document has been voided'; end if;
end; $$;
revoke all on function public.check_can_send(public.documents) from public, anon, authenticated;

-- notes the channel on the "sent" line written a moment ago by mark_document_sent
create or replace function public.tag_sent_channel(doc uuid, chan text) returns void
language sql security definer set search_path = public as $$
  update public.activity set detail = detail || jsonb_build_object('channel', chan)
  where id = (select id from public.activity where document_id = doc and action in ('document.sent', 'document.approved_and_sent')
      and actor_id is not distinct from auth.uid() and created_at > now() - interval '5 minutes' and not (detail ? 'channel')
    order by id desc limit 1);
$$;
revoke all on function public.tag_sent_channel(uuid, text) from public, anon, authenticated;

-- queues an email. send_at null = in 10 seconds (can be undone until then).
-- mark_on_send: the document is marked sent when the email goes (schedules
-- and recurring copies); otherwise it must already be sent.
create or replace function public.queue_document_send(doc_id uuid, to_email text, cc text[] default '{}',
  subject text default '', message text default '', include_pdf boolean default true,
  send_at timestamptz default null, mark_on_send boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype; s public.document_sends%rowtype; addr text; clean_cc text[] := '{}'; c text;
  pattern constant text := '^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]{2,}$';
begin
  select * into d from public.documents where id = doc_id for update;
  if not found then raise exception 'Document not found'; end if;
  perform public.check_can_send(d);
  if not mark_on_send and d.status in ('draft', 'pending_approval') then raise exception 'Send the document first'; end if;
  if d.kind = 'invoice' and d.status = 'paid' and send_at is not null then raise exception 'This invoice is already paid'; end if;
  addr := lower(trim(coalesce(to_email, '')));
  if addr !~ pattern then raise exception 'That email doesn''t look right. Check for a typo.'; end if;
  foreach c in array coalesce(cc, '{}') loop
    c := lower(trim(c));
    continue when c = '' or c = addr or c = any(clean_cc);
    if c !~ pattern then raise exception 'CC: % doesn''t look right. Check for a typo.', left(c, 80); end if;
    clean_cc := clean_cc || c;
  end loop;
  if cardinality(clean_cc) > 5 then raise exception 'Add at most 5 CC addresses'; end if;
  if send_at is not null and (send_at < now() - interval '1 minute' or send_at > now() + interval '366 days') then
    raise exception 'Choose a time in the next 12 months';
  end if;
  if (select count(*) from public.document_sends where business_id = d.business_id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many emails in the last hour. Try again later.';
  end if;
  insert into public.document_sends(business_id, document_id, kind, to_email, cc, subject, message, include_pdf, send_after, mark_on_send, created_by)
    values (d.business_id, d.id, case when send_at is null then 'now' else 'scheduled' end, addr, clean_cc,
      left(trim(coalesce(subject, '')), 200), left(coalesce(message, ''), 4000), coalesce(include_pdf, true),
      coalesce(send_at, now() + interval '10 seconds'), coalesce(mark_on_send, false), auth.uid())
    returning * into s;
  if send_at is null then
    perform public.tag_sent_channel(d.id, 'email');
  else
    insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
      values (d.business_id, d.id, auth.uid(), public.actor_label(d.business_id), 'document.scheduled',
        jsonb_build_object('to', addr, 'send_after', s.send_after, 'send_id', s.id));
  end if;
  return jsonb_build_object('id', s.id, 'send_after', s.send_after, 'to', addr, 'cc', to_jsonb(clean_cc));
end; $$;

-- Undo / cancel a schedule: only while it is still waiting
create or replace function public.cancel_document_send(send_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.document_sends%rowtype; d public.documents%rowtype;
begin
  select * into s from public.document_sends where id = send_id for update;
  if not found then raise exception 'Not found'; end if;
  select * into d from public.documents where id = s.document_id;
  if public.member_role(s.business_id) is null then raise exception 'Not found'; end if;
  if not public.has_role(s.business_id, array['owner', 'manager', 'finance']) and s.created_by is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  if s.status <> 'queued' then
    return jsonb_build_object('cancelled', false, 'status', s.status);
  end if;
  update public.document_sends set status = 'cancelled', updated_at = now() where id = s.id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (s.business_id, s.document_id, auth.uid(), public.actor_label(s.business_id),
      case when s.kind = 'now' then 'document.email_undone' else 'document.schedule_cancelled' end,
      jsonb_build_object('to', s.to_email));
  return jsonb_build_object('cancelled', true, 'status', 'cancelled');
end; $$;

-- server only: hands out due emails once. A row stuck in "sending" (the app
-- stopped mid-way) is handed out again after 15 minutes, at most 3 times.
create or replace function public.claim_due_sends(max_rows integer default 20, only_ids uuid[] default null, only_business uuid default null)
returns setof public.document_sends language plpgsql security definer set search_path = public as $$
declare s public.document_sends%rowtype;
begin
  update public.document_sends set status = 'failed', error = 'Gave up after 3 tries', updated_at = now()
    where status = 'sending' and claimed_at < now() - interval '15 minutes' and attempts >= 3;
  for s in
    select * from public.document_sends x
    where ((x.status = 'queued' and x.send_after <= now())
        or (x.status = 'sending' and x.claimed_at < now() - interval '15 minutes' and x.attempts < 3))
      and (only_ids is null or x.id = any(only_ids))
      and (only_business is null or x.business_id = only_business)
    order by x.send_after
    limit greatest(1, least(coalesce(max_rows, 20), 100))
    for update skip locked
  loop
    if s.mark_on_send then
      -- scheduled and recurring sends mark the document sent now, as the person who set them up
      begin
        perform set_config('request.jwt.claim.sub', coalesce(s.created_by::text, ''), true);
        perform public.mark_document_sent(s.document_id, null);
        perform public.tag_sent_channel(s.document_id, 'email');
        perform set_config('request.jwt.claim.sub', '', true);
      exception when others then
        perform set_config('request.jwt.claim.sub', '', true);
        update public.document_sends set status = 'failed', error = left(sqlerrm, 300), updated_at = now() where id = s.id;
        insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
          values (s.business_id, s.document_id, s.created_by, public.actor_label_for(s.business_id, s.created_by), 'document.send_failed',
            jsonb_build_object('to', s.to_email, 'reason', left(sqlerrm, 200)));
        continue;
      end;
    end if;
    update public.document_sends set status = 'sending', claimed_at = now(), attempts = attempts + 1, mark_on_send = false, updated_at = now()
      where id = s.id returning * into s;
    return next s;
  end loop;
end; $$;

create or replace function public.finish_document_send(send_id uuid, ok boolean, reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare s public.document_sends%rowtype;
begin
  select * into s from public.document_sends where id = send_id for update;
  if not found or s.status <> 'sending' then return; end if;
  update public.document_sends set status = case when ok then 'sent' else 'failed' end,
      sent_at = case when ok then now() end, error = case when ok then '' else left(coalesce(reason, ''), 300) end, updated_at = now()
    where id = s.id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (s.business_id, s.document_id, s.created_by, public.actor_label_for(s.business_id, s.created_by),
      case when ok then 'document.emailed' else 'document.send_failed' end,
      jsonb_build_object('channel', 'email', 'to', s.to_email, 'cc', to_jsonb(s.cc), 'reason', case when ok then null else left(coalesce(reason, ''), 200) end));
end; $$;

revoke all on function public.queue_document_send(uuid, text, text[], text, text, boolean, timestamptz, boolean) from public, anon;
revoke all on function public.cancel_document_send(uuid) from public, anon;
revoke all on function public.claim_due_sends(integer, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.finish_document_send(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.queue_document_send(uuid, text, text[], text, text, boolean, timestamptz, boolean) to authenticated;
grant execute on function public.cancel_document_send(uuid) to authenticated;
grant execute on function public.claim_due_sends(integer, uuid[], uuid) to service_role;
grant execute on function public.finish_document_send(uuid, boolean, text) to service_role;

-- 2 -------------------------------------------------------------------------
create or replace function public.record_document_share(doc_id uuid, chan text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  if chan not in ('whatsapp', 'link', 'qr', 'pdf', 'share') then raise exception 'Unknown channel'; end if;
  select * into d from public.documents where id = doc_id;
  if not found or not public.is_member(d.business_id) then raise exception 'Document not found'; end if;
  if d.status in ('draft', 'pending_approval', 'void') then return; end if;
  -- the first share right after sending names the channel on the "sent" line
  perform public.tag_sent_channel(d.id, chan);
  -- one line per person and channel every 10 minutes is plenty
  if exists (select 1 from public.activity where document_id = d.id and action = 'document.shared' and actor_id = auth.uid()
      and detail->>'channel' = chan and created_at > now() - interval '10 minutes') then return; end if;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (d.business_id, d.id, auth.uid(), public.actor_label(d.business_id), 'document.shared', jsonb_build_object('channel', chan));
end; $$;
revoke all on function public.record_document_share(uuid, text) from public, anon;
grant execute on function public.record_document_share(uuid, text) to authenticated;

-- 3 -------------------------------------------------------------------------
alter table public.documents add column if not exists recur_interval text;
alter table public.documents add column if not exists recur_next_on date;
alter table public.documents add column if not exists recur_day smallint;
alter table public.documents add column if not exists recur_auto_send boolean not null default false;
alter table public.documents add column if not exists recur_by uuid references auth.users(id) on delete set null;
alter table public.documents add column if not exists recur_source_id uuid references public.documents(id) on delete set null;
alter table public.documents add column if not exists recur_period date;
alter table public.documents add column if not exists view_notified_at timestamptz;
do $$ begin
  alter table public.documents add constraint documents_recur_interval check (recur_interval is null or recur_interval in ('weekly', 'monthly'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents add constraint documents_recur_day check (recur_day is null or recur_day between 1 and 31);
exception when duplicate_object then null; end $$;
create unique index if not exists documents_recur_period_idx on public.documents(recur_source_id, recur_period) where recur_source_id is not null;
create index if not exists documents_recur_due_idx on public.documents(recur_next_on) where recur_interval is not null;

-- weekly: +7 days. monthly: same day next month, or the month's last day
-- (31 Jan → 28/29 Feb → 31 Mar). Mirrors nextRecurrence() in lib/send-core.js.
create or replace function public.next_recurrence(d date, every text, anchor integer) returns date
language plpgsql immutable as $$
declare m date; last_day integer;
begin
  if every = 'weekly' then return d + 7; end if;
  m := (date_trunc('month', d) + interval '1 month')::date;
  last_day := extract(day from (m + interval '1 month' - interval '1 day'))::integer;
  return m + (least(coalesce(anchor, extract(day from d)::integer), last_day) - 1);
end; $$;

create or replace function public.set_document_recurrence(doc_id uuid, every text, next_on date, auto_send boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype; today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or not public.has_role(d.business_id, array['owner', 'manager', 'finance']) then
    if found and public.member_role(d.business_id) is not null then raise exception 'A manager or finance officer can set up repeats'; end if;
    raise exception 'Document not found';
  end if;
  if every is null then
    update public.documents set recur_interval = null, recur_next_on = null, recur_day = null, recur_auto_send = false, updated_at = now() where id = d.id;
    if d.recur_interval is not null then
      insert into public.activity(business_id, document_id, actor_id, actor_label, action)
        values (d.business_id, d.id, auth.uid(), public.actor_label(d.business_id), 'document.recurring_stopped');
    end if;
    return jsonb_build_object('interval', null);
  end if;
  if d.kind <> 'invoice' then raise exception 'Only invoices can repeat'; end if;
  if d.source <> 'app' then raise exception 'Sales from the till can''t repeat'; end if;
  if d.status = 'void' then raise exception 'This document has been voided'; end if;
  if every not in ('weekly', 'monthly') then raise exception 'Choose weekly or monthly'; end if;
  if next_on is null or next_on <= today or next_on > today + 366 then raise exception 'Choose a start date in the next 12 months'; end if;
  if auto_send and coalesce(d.customer_email, '') = '' then raise exception 'Add an email for this client to send repeats automatically'; end if;
  update public.documents set recur_interval = every, recur_next_on = next_on, recur_day = extract(day from next_on)::smallint,
      recur_auto_send = coalesce(auto_send, false), recur_by = auth.uid(), updated_at = now()
    where id = d.id;
  insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
    values (d.business_id, d.id, auth.uid(), public.actor_label(d.business_id), 'document.recurring_set',
      jsonb_build_object('interval', every, 'next_on', next_on, 'auto_send', coalesce(auto_send, false)));
  return jsonb_build_object('interval', every, 'next_on', next_on);
end; $$;
revoke all on function public.set_document_recurrence(uuid, text, date, boolean) from public, anon;
grant execute on function public.set_document_recurrence(uuid, text, date, boolean) to authenticated;

-- server only (daily job): one draft copy per repeating invoice whose date
-- has come. Running it twice for the same period makes nothing new.
create or replace function public.run_due_recurrences(as_of date default (now() at time zone 'Africa/Lagos')::date, max_rows integer default 50)
returns table (source_id uuid, new_id uuid, period date, send_id uuid)
language plpgsql security definer set search_path = public as $$
declare src public.documents%rowtype; fresh uuid; made uuid; num text; per date; q uuid;
begin
  for src in
    select * from public.documents x
    where x.recur_interval is not null and x.recur_next_on <= as_of and x.status <> 'void' and x.kind = 'invoice'
    order by x.recur_next_on
    limit greatest(1, least(coalesce(max_rows, 50), 500))
    for update skip locked
  loop
    per := src.recur_next_on;
    made := null; q := null;
    if not exists (select 1 from public.documents where recur_source_id = src.id and recur_period = per) then
      fresh := gen_random_uuid();
      num := public.next_document_number(src.business_id, 'invoice');
      insert into public.documents
        select (jsonb_populate_record(null::public.documents, to_jsonb(src) || jsonb_build_object(
          'id', fresh, 'number', num, 'status', 'draft', 'access_token', encode(gen_random_bytes(24), 'hex'),
          'issue_date', per, 'due_date', case when src.due_date is null then null else per + (src.due_date - src.issue_date) end,
          'valid_until', null, 'amount_paid_minor', 0, 'counted_toward_allowance', false, 'snapshot', null,
          'sent_at', null, 'viewed_at', null, 'paid_at', null, 'voided_at', null, 'accepted_at', null, 'accepted_name', '',
          'declined_at', null, 'decline_reason', '', 'submitted_by', null, 'approved_by', null, 'approved_at', null,
          'source_quote_id', null, 'converted_invoice_id', null, 'source', 'app', 'source_ref', null,
          'recur_interval', null, 'recur_next_on', null, 'recur_day', null, 'recur_auto_send', false, 'recur_by', null,
          'recur_source_id', src.id, 'recur_period', per, 'view_notified_at', null,
          'created_by', coalesce(src.recur_by, src.created_by), 'created_at', now(), 'updated_at', now()))).*
        on conflict do nothing
        returning id into made;
      if made is not null then
        insert into public.document_items
          select (jsonb_populate_record(null::public.document_items, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'document_id', made))).*
          from public.document_items i where i.document_id = src.id;
        insert into public.document_costs
          select (jsonb_populate_record(null::public.document_costs, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'document_id', made))).*
          from public.document_costs c where c.document_id = src.id;
        perform public.recalculate_document(made);
        insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
          values (src.business_id, made, src.recur_by, public.actor_label_for(src.business_id, src.recur_by), 'document.created',
            jsonb_build_object('repeat_of', src.number)),
            (src.business_id, src.id, src.recur_by, public.actor_label_for(src.business_id, src.recur_by), 'document.recurred',
            jsonb_build_object('number', num, 'new_id', made));
        if src.recur_auto_send and coalesce(src.customer_email, '') <> '' then
          insert into public.document_sends(business_id, document_id, kind, to_email, send_after, mark_on_send, created_by)
            values (src.business_id, made, 'recurring', lower(src.customer_email), now(), true, src.recur_by)
            returning id into q;
        end if;
      end if;
    end if;
    update public.documents set recur_next_on = public.next_recurrence(per, src.recur_interval, src.recur_day) where id = src.id;
    source_id := src.id; new_id := made; period := per; send_id := q;
    return next;
  end loop;
end; $$;
revoke all on function public.run_due_recurrences(date, integer) from public, anon, authenticated;
grant execute on function public.run_due_recurrences(date, integer) to service_role;

-- 4 -------------------------------------------------------------------------
-- true when the business should be told now (and notes that it was)
create or replace function public.claim_view_notice(doc_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with u as (
    update public.documents set view_notified_at = now()
    where id = doc_id and (view_notified_at is null or view_notified_at < now() - interval '1 day')
    returning 1)
  select exists (select 1 from u);
$$;
revoke all on function public.claim_view_notice(uuid) from public, anon, authenticated;
grant execute on function public.claim_view_notice(uuid) to service_role;
