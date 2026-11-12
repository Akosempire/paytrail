-- Co-founder access: beyond the read-only dashboard, a founder with
-- can_manage can change plans and prices (including deleting a plan nobody is
-- on) and see the list of businesses with their contact details. They are
-- still not platform admins: keys, settings, health, integrations, tax and
-- marketing stay closed. Admins switch it per founder (Admin -> Settings).
-- Needs RUN_NEW_2026-11-08a.sql first. Safe to run more than once.

alter table public.platform_viewers add column if not exists can_manage boolean not null default true;

-- a founder (confirmed email) who may manage plans and see customers
create or replace function public.is_platform_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_viewers v
    join auth.users u on lower(u.email) = v.email
    where u.id = auth.uid() and u.email_confirmed_at is not null and v.can_manage
  );
$$;
revoke all on function public.is_platform_manager() from public, anon;
grant execute on function public.is_platform_manager() to authenticated;

-- plans: admins and managing founders change them; everyone reads active ones
drop policy if exists "anyone reads active plans" on public.plans;
create policy "anyone reads active plans" on public.plans for select
  using (active or public.is_platform_admin() or public.is_platform_manager());
drop policy if exists "admins manage plans" on public.plans;
create policy "admins manage plans" on public.plans for all
  using (public.is_platform_admin() or public.is_platform_manager())
  with check (public.is_platform_admin() or public.is_platform_manager());
-- deleting goes through delete_plan only (it checks nobody is on the plan)
revoke delete on public.plans from authenticated;

-- delete a plan nobody is on. Past payments keep their amounts; their plan
-- shows as deleted. Anyone on it: refused, so no paying business loses its plan.
create or replace function public.delete_plan(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (public.is_platform_admin() or public.is_platform_manager()) then raise exception 'Not allowed'; end if;
  select count(*) into n from public.businesses where plan_id = p_id;
  if n > 0 then
    raise exception 'IN_USE:%', n;
  end if;
  delete from public.plans where id = p_id;
  if not found then raise exception 'Plan not found'; end if;
end; $$;
revoke all on function public.delete_plan(uuid) from public, anon;
grant execute on function public.delete_plan(uuid) to authenticated;

-- how many businesses are on each plan, and how many of them pay (the plans
-- page shows both, and warns before deleting)
drop function if exists public.plan_usage();
create or replace function public.plan_usage() returns table (plan_id uuid, businesses bigint, paying bigint)
language sql stable security definer set search_path = public as $$
  select b.plan_id, count(*), count(*) filter (where b.subscription_status = 'active') from public.businesses b
  where b.plan_id is not null and (public.is_platform_admin() or public.is_platform_manager())
  group by b.plan_id;
$$;
revoke all on function public.plan_usage() from public, anon;
grant execute on function public.plan_usage() to authenticated;

-- Usetally's customers: every business with its owner and contact details
create or replace function public.founder_customers(p_search text default '', p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
begin
  if not (public.is_platform_admin() or public.is_platform_manager()) then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.businesses b
              left join public.memberships m on m.business_id = b.id and m.role = 'owner'
              left join auth.users u on u.id = m.user_id
              where q = '%%' or lower(b.name) like q or lower(b.email) like q or b.phone like q
                 or lower(coalesce(u.email, m.email, '')) like q or lower(coalesce(m.full_name, '')) like q),
    'rows', coalesce((select jsonb_agg(r) from (
      select jsonb_build_object(
        'id', b.id, 'name', b.name, 'kind', b.kind,
        'owner_name', coalesce(m.full_name, ''),
        'owner_email', coalesce(u.email, m.email, ''),
        'email', b.email, 'phone', b.phone, 'country', b.country,
        'plan', p.name, 'status', b.subscription_status, 'joined', b.created_at,
        'documents_sent', (select count(*) from public.documents d where d.business_id = b.id and d.sent_at is not null and d.source <> 'pos')
      ) r
      from public.businesses b
      left join public.memberships m on m.business_id = b.id and m.role = 'owner'
      left join auth.users u on u.id = m.user_id
      left join public.plans p on p.id = b.plan_id
      where q = '%%' or lower(b.name) like q or lower(b.email) like q or b.phone like q
         or lower(coalesce(u.email, m.email, '')) like q or lower(coalesce(m.full_name, '')) like q
      order by b.created_at desc
      limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'::jsonb)
  );
end; $$;
revoke all on function public.founder_customers(text, int, int) from public, anon;
grant execute on function public.founder_customers(text, int, int) to authenticated;

-- admins switch a founder's access level
grant update (can_manage) on public.platform_viewers to authenticated;
