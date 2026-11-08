-- Founder view: a read-only dashboard for non-technical founders.
-- Customers, money in, and Usetally's own payment gateway, nothing technical.
-- A founder is NOT a platform admin: every admin page and admin function keeps
-- refusing them. Platform admins add a founder by email (Admin → Settings);
-- they get in once they've signed up and confirmed that email.
-- Safe to run more than once.

create table if not exists public.platform_viewers (
  email text primary key check (email = lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  note text not null default '' check (length(note) <= 80),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.platform_viewers enable row level security;
drop policy if exists "admins manage founders" on public.platform_viewers;
create policy "admins manage founders" on public.platform_viewers for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke all on public.platform_viewers from anon, authenticated;
grant select, insert, delete on public.platform_viewers to authenticated;

-- is the signed-in person a founder? (confirmed email only, so nobody can sign
-- up with a founder's address and get in before they've proven it's theirs)
create or replace function public.is_platform_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_viewers v
    join auth.users u on lower(u.email) = v.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_platform_viewer() from public, anon;
grant execute on function public.is_platform_viewer() to authenticated;

-- everything the founder dashboard shows, in one read-only call
create or replace function public.founder_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m0 timestamptz := date_trunc('month', now());
  m1 timestamptz := date_trunc('month', now()) - interval '1 month';
  money_in jsonb;
begin
  if not (public.is_platform_admin() or public.is_platform_viewer()) then raise exception 'Not allowed'; end if;

  return jsonb_build_object(
    'businesses', (select count(*) from public.businesses),
    'companies', (select count(*) from public.businesses where kind = 'company'),
    'trialing', (select count(*) from public.businesses where subscription_status = 'trialing'),
    'paying', (select count(*) from public.businesses where subscription_status = 'active'),
    'lapsed', (select count(*) from public.businesses where subscription_status in ('past_due','canceled')),
    'signups_month', (select count(*) from public.businesses where created_at >= m0),
    'signups_last_month', (select count(*) from public.businesses where created_at >= m1 and created_at < m0),
    'documents_month', (select count(*) from public.documents where sent_at >= m0),
    'documents_last_month', (select count(*) from public.documents where sent_at >= m1 and sent_at < m0),

    -- money received for Usetally plans (through the gateway, or recorded by hand)
    'revenue_month', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount_minor) total from public.subscription_payments where amount_minor > 0 and created_at >= m0 group by currency) x), '{}'::jsonb),
    'revenue_last_month', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount_minor) total from public.subscription_payments where amount_minor > 0 and created_at >= m1 and created_at < m0 group by currency) x), '{}'::jsonb),
    'revenue_all', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount_minor) total from public.subscription_payments where amount_minor > 0 group by currency) x), '{}'::jsonb),

    'months', (select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'signups', (select count(*) from public.businesses where created_at >= m and created_at < m + interval '1 month'),
        'payments', (select count(*) from public.subscription_payments where amount_minor > 0 and created_at >= m and created_at < m + interval '1 month'),
        'revenue', coalesce((select jsonb_object_agg(currency, total) from (select currency, sum(amount_minor) total from public.subscription_payments where amount_minor > 0 and created_at >= m and created_at < m + interval '1 month' group by currency) x), '{}'::jsonb)
      ) order by m)
      from generate_series(m0 - interval '5 months', m0, interval '1 month') m),

    'plans', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'businesses', n) order by n desc, name)
      from (select coalesce(p.name, 'No plan') name, count(*) n from public.businesses b left join public.plans p on p.id = b.plan_id
            where b.subscription_status = 'active' group by 1) x), '[]'::jsonb),

    -- the gateway: which one, and whether it's taking real money (never any key)
    'gateway', (select jsonb_build_object(
        'provider', s.billing_provider,
        'connected', s.billing_provider <> 'manual' and s.billing_key_hint is not null,
        'mode', (select a.mode from public.payment_attempts a where a.purpose = 'subscription' order by a.created_at desc limit 1)
      ) from public.platform_settings s where s.id = true),

    'checkouts_month', (select jsonb_build_object(
        'started', count(*),
        'paid', count(*) filter (where status = 'succeeded'),
        'unfinished', count(*) filter (where status = 'failed'),
        'open', count(*) filter (where status = 'pending'))
      from public.payment_attempts where purpose = 'subscription' and mode = 'live' and created_at >= m0),

    'recent_payments', coalesce((select jsonb_agg(r order by r->>'at' desc) from (
        select jsonb_build_object('business', b.name, 'plan', p.name, 'amount_minor', sp.amount_minor, 'currency', sp.currency, 'method', sp.method, 'at', sp.created_at) r
        from public.subscription_payments sp join public.businesses b on b.id = sp.business_id left join public.plans p on p.id = sp.plan_id
        where sp.amount_minor > 0 order by sp.created_at desc limit 12) x), '[]'::jsonb),

    -- upgrades started in the last 14 days that never got paid
    'unpaid', coalesce((select jsonb_agg(u order by u->>'at' desc) from (
        select distinct on (a.business_id) jsonb_build_object(
          'business', b.name, 'plan', p.name, 'amount_minor', a.amount_minor, 'currency', a.currency, 'at', a.created_at,
          'reason', case when a.failure_reason ~* 'expired|abandon' then 'Checkout expired'
                         when a.failure_reason ~* 'declin' then 'Card declined' else 'Not completed' end) u
        from public.payment_attempts a join public.businesses b on b.id = a.business_id left join public.plans p on p.id = a.plan_id
        where a.purpose = 'subscription' and a.status = 'failed' and a.mode = 'live'
          and a.created_at > now() - interval '14 days'
          and a.failure_reason !~* 'test_mode_payment|mismatch'
          and not exists (select 1 from public.payment_attempts ok where ok.business_id = a.business_id and ok.purpose = 'subscription' and ok.status = 'succeeded' and ok.created_at > a.created_at)
        order by a.business_id, a.created_at desc) x), '[]'::jsonb)
  );
end; $$;
revoke all on function public.founder_summary() from public, anon;
grant execute on function public.founder_summary() to authenticated;

-- the app's menu shows the founder dashboard link to founders
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

  return jsonb_build_object('profile', prof, 'memberships', mems, 'is_admin', adm, 'is_founder', public.is_platform_viewer(),
    'business', biz, 'allowance', allow);
end;
$$;
revoke all on function public.app_context() from public, anon;
grant execute on function public.app_context() to authenticated;
