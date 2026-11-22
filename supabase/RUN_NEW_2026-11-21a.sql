-- RUN IN SUPABASE -> SQL EDITOR (2026-11-21a): WhatsApp community sign-ups (usetally.cc/community).
-- Safe to run more than once.


-- "staff" = platform admins and managing co-founders. Defined in
-- RUN_NEW_2026-11-12c.sql; created here too if that hasn't been run, so this
-- file works on its own.
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_platform_staff') then
    create function public.is_platform_staff() returns boolean
    language plpgsql stable security definer set search_path = public as $f$
    begin
      return public.is_platform_admin() or public.is_platform_manager();
    exception when undefined_function then
      return public.is_platform_admin(); -- before the co-founder SQL: admins only
    end; $f$;
    revoke all on function public.is_platform_staff() from public, anon;
    grant execute on function public.is_platform_staff() to authenticated;
  end if;
end $do$;

alter table public.platform_settings
  add column if not exists community_enabled boolean not null default false,
  add column if not exists community_link text not null default '',
  add column if not exists community_batches text[] not null default '{}',
  add column if not exists community_rules text not null default '';
grant select (community_enabled, community_link, community_batches, community_rules) on public.platform_settings to authenticated;

create table if not exists public.community_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  phone text not null default '',
  batch text not null default '',
  business_name text not null default '',
  stage text not null default '',
  consent boolean not null check (consent),
  token text not null unique,                    -- in the email's join link
  emailed_at timestamptz,
  reminders int not null default 0,
  last_reminded_at timestamptz,
  clicked_at timestamptz,                         -- opened the join link: no more reminders
  stopped_at timestamptz,                         -- asked for no more reminders
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists community_signups_email_idx on public.community_signups (lower(email));
create index if not exists community_signups_waiting_idx on public.community_signups (created_at) where clicked_at is null and stopped_at is null;

alter table public.community_signups enable row level security;
revoke all on public.community_signups from anon, authenticated;
grant all on public.community_signups to service_role;
-- admins and co-founders with Marketing read the list; sign-ups and clicks are written by the server
grant select on public.community_signups to authenticated;
drop policy if exists "staff read community signups" on public.community_signups;
create policy "staff read community signups" on public.community_signups for select
  using (public.is_platform_admin() or public.is_platform_staff());

-- your group link (change it any time in Admin -> Community)
update public.platform_settings set community_link = 'https://chat.whatsapp.com/H5nK4gc3lSnIfXkyX0v7rE' where id and community_link = '';
