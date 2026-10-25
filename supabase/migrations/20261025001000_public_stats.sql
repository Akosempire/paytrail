-- Usetally: live numbers on the website (people using Usetally, money
-- processed in naira and dollars). Totals only, never anyone's details.
-- Safe to run more than once.
alter table public.platform_settings add column if not exists public_stats boolean not null default true;

create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when coalesce((select public_stats from public.platform_settings where id = true), true) then jsonb_build_object(
    'users', (select count(*) from auth.users where email_confirmed_at is not null),
    'businesses', (select count(*) from public.businesses where onboarded_at is not null),
    'ngn_minor', (select coalesce(sum(amount_minor), 0) from public.payments where currency = 'NGN'),
    'usd_minor', (select coalesce(sum(amount_minor), 0) from public.payments where currency = 'USD'),
    'payments', (select count(*) from public.payments)
  ) else null end;
$$;
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated, service_role;
