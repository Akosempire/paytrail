-- Sign-up codes and password resets are sent by the app through Brevo
-- (not by Supabase), so the app needs two small helpers. Both are for the
-- server only (service role); signed-in users and the public can't use them.

-- 1. A log of auth emails sent, to rate-limit them per address.
--    Only a hash of the email is stored.
create table if not exists public.email_sends (
  id bigserial primary key,
  email_hash text not null,
  kind text not null check (kind in ('signup', 'reset')),
  created_at timestamptz not null default now()
);
create index if not exists email_sends_lookup on public.email_sends(email_hash, kind, created_at desc);
alter table public.email_sends enable row level security;
revoke all on public.email_sends from anon, authenticated;
grant select, insert, delete on public.email_sends to service_role;
grant usage, select on sequence public.email_sends_id_seq to service_role;

-- 2. Does an account exist for this email, and is it confirmed?
--    Used before re-sending a sign-up code, so codes only go to real,
--    unconfirmed accounts.
create or replace function public.auth_email_status(target_email text)
returns table (user_id uuid, confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null
  from auth.users u
  where lower(u.email) = lower(trim(target_email))
  limit 1;
$$;
revoke all on function public.auth_email_status(text) from public, anon, authenticated;
grant execute on function public.auth_email_status(text) to service_role;

-- Speed: everything a signed-in dashboard page needs about the user, in ONE
-- round trip instead of two in a row (profile, memberships, admin flag, the
-- active business with its plan, and the plan allowance).
-- security invoker: it runs as the signed-in user, so row-level security
-- applies exactly as it does to the separate queries it replaces.
create or replace function public.app_context()
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof jsonb;
  mems jsonb;
  adm boolean;
  bid uuid;
  biz jsonb;
  allow jsonb;
begin
  if uid is null then return null; end if;

  select to_jsonb(p) into prof from public.profiles p where p.user_id = uid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'business_id', m.business_id, 'role', m.role, 'can_view_costs', m.can_view_costs,
      'full_name', m.full_name, 'email', m.email,
      'businesses', jsonb_build_object('id', b.id, 'name', b.name, 'kind', b.kind, 'logo_path', b.logo_path, 'brand_color', b.brand_color)
    ) order by m.created_at), '[]'::jsonb)
  into mems
  from public.memberships m join public.businesses b on b.id = m.business_id
  where m.user_id = uid;

  select exists (select 1 from public.platform_admins a where a.user_id = uid) into adm;

  select (e->>'business_id')::uuid into bid
  from jsonb_array_elements(mems) e
  where (e->>'business_id') = (prof->>'active_business_id')
  limit 1;
  if bid is null then bid := (mems->0->>'business_id')::uuid; end if;

  if bid is not null then
    select to_jsonb(b) || jsonb_build_object('plans', (
        select jsonb_build_object('id', pl.id, 'name', pl.name, 'document_limit', pl.document_limit, 'seat_limit', pl.seat_limit)
        from public.plans pl where pl.id = b.plan_id))
    into biz from public.businesses b where b.id = bid;
    allow := public.business_allowance(bid);
  end if;

  return jsonb_build_object('profile', prof, 'memberships', mems, 'is_admin', adm, 'business', biz, 'allowance', allow);
end;
$$;
revoke all on function public.app_context() from public, anon;
grant execute on function public.app_context() to authenticated;
