-- Usetally: offline mode. Every change made offline carries an id; the server
-- records each one it applies, so a change sent twice (a retry after a dropped
-- connection) is applied once. Safe to run more than once.
create table if not exists public.offline_ops (
  id text primary key check (char_length(id) between 8 and 80),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  result jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists offline_ops_business_idx on public.offline_ops(business_id, created_at desc);
alter table public.offline_ops enable row level security;
drop policy if exists "members read their offline ops" on public.offline_ops;
create policy "members read their offline ops" on public.offline_ops for select using (public.is_member(business_id));
drop policy if exists "members record offline ops" on public.offline_ops;
create policy "members record offline ops" on public.offline_ops for insert with check (public.is_member(business_id) and user_id = auth.uid());
grant select, insert on public.offline_ops to authenticated;
grant all on public.offline_ops to service_role;
