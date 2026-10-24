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
