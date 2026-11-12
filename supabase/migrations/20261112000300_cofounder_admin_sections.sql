-- Co-founders in the admin area: a co-founder with "Plans & customers" (the
-- can_manage switch) can also work in these admin sections: Businesses,
-- Plans & pricing, Inbox, Announcements, Usage, Marketing, Tax filing and
-- Health. Overview, Integrations and Settings (payment keys, email, storage,
-- billing, founder access) stay with platform admins only.
-- Most of those pages read through the server; the Inbox reads through these
-- database rules, so they now recognise co-founders too ("staff").
-- Needs RUN_NEW_2026-11-12b.sql first. Safe to run more than once.

create or replace function public.is_platform_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.is_platform_manager();
$$;
revoke all on function public.is_platform_staff() from public, anon;
grant execute on function public.is_platform_staff() to authenticated;

-- Inbox: threads and messages from users, readable by the team
drop policy if exists "own or team reads threads" on public.feedback_threads;
create policy "own or team reads threads" on public.feedback_threads for select
  using (user_id = auth.uid() or public.is_platform_staff());
drop policy if exists "own or team reads messages" on public.feedback_messages;
create policy "own or team reads messages" on public.feedback_messages for select
  using (exists (select 1 from public.feedback_threads t where t.id = thread_id and (t.user_id = auth.uid() or public.is_platform_staff())));
drop policy if exists "team reads usage" on public.usage_daily;
create policy "team reads usage" on public.usage_daily for select using (public.is_platform_staff());

-- Inbox: replying, marking read and changing status (same as before, for staff)
create or replace function public.feedback_reply(thread uuid, body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare th public.feedback_threads%rowtype; team boolean := public.is_platform_staff();
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
  if public.is_platform_staff() then update public.feedback_threads set unread_admin = false where id = thread and user_id is distinct from auth.uid(); end if;
end; $$;


create or replace function public.feedback_set_status(thread uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_staff() then raise exception 'Not allowed'; end if;
  if new_status not in ('open', 'planned', 'done', 'closed') then raise exception 'Unknown status'; end if;
  update public.feedback_threads set status = new_status where id = thread;
end; $$;


-- Businesses: extending a subscription by hand (recorded with who did it)
create or replace function public.admin_extend_subscription(target uuid, new_plan uuid, pay_reference text, pay_amount bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p public.plans%rowtype;
begin
  if not public.is_platform_staff() then raise exception 'Not allowed'; end if;
  select * into p from public.plans where id = new_plan;
  return public.extend_subscription(target, new_plan, 'manual', pay_reference, coalesce(pay_amount, p.price_minor), p.currency, auth.uid());
end; $$;
grant execute on function public.admin_extend_subscription(uuid, uuid, text, bigint) to authenticated;
