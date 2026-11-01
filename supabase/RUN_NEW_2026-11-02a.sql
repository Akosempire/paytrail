-- Announcements from the Usetally team: a banner on every dashboard while
-- active, and optionally one email to each business owner (Admin → Announcements).
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  link_href text not null default '' check (char_length(link_href) <= 300),
  link_label text not null default '' check (char_length(link_label) <= 40),
  active boolean not null default false,
  published_at timestamptz,
  emailed_at timestamptz,
  email_sent integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists announcements_active_idx on public.announcements(published_at desc) where active;
alter table public.announcements enable row level security;
drop policy if exists "signed-in users read active announcements" on public.announcements;
create policy "signed-in users read active announcements" on public.announcements for select to authenticated using (active);
revoke all on public.announcements from anon;
grant select on public.announcements to authenticated;
grant all on public.announcements to service_role;
