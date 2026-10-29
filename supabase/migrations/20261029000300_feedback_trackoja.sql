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
