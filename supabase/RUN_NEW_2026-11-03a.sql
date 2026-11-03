-- Announcements to chosen businesses only (Admin → Announcements → Audience).
-- "all": every dashboard, email to every owner. "selected": only the businesses
-- in business_ids see the banner, and only their owners get the email.
alter table public.announcements add column if not exists audience text not null default 'all';
alter table public.announcements add column if not exists business_ids uuid[] not null default '{}';
do $$ begin
  alter table public.announcements add constraint announcements_audience_check check (audience in ('all', 'selected'));
exception when duplicate_object then null; end $$;

drop policy if exists "signed-in users read active announcements" on public.announcements;
create policy "signed-in users read active announcements" on public.announcements for select to authenticated
  using (active and (audience = 'all' or exists (
    select 1 from public.memberships m where m.user_id = auth.uid() and m.business_id = any(business_ids))));
