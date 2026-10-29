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
