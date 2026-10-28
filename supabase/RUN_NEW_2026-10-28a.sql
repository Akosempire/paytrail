-- Usetally: ad performance (Admin → Marketing). Safe to run more than once.
--  1. Which ad each business came from (UTM tags and Meta's click IDs, saved
--     when the business is created), plus the browser details Meta needs to
--     match a later payment to the ad.
--  2. Each Meta ad's results per day (synced every 6 hours).
--  3. The thresholds for the verdicts, the Meta connection and report email.
--  4. A log of the reports sent.
-- Only platform admins can read these; the sync job writes with the service key.

alter table public.businesses add column if not exists utm_source text;
alter table public.businesses add column if not exists utm_medium text;
alter table public.businesses add column if not exists utm_campaign text;
alter table public.businesses add column if not exists utm_content text;
alter table public.businesses add column if not exists utm_term text;
alter table public.businesses add column if not exists fbclid text;
alter table public.businesses add column if not exists fbc text;
alter table public.businesses add column if not exists fbp text;
alter table public.businesses add column if not exists first_landing_url text;
alter table public.businesses add column if not exists landed_at timestamptz;
alter table public.businesses add column if not exists attr_last jsonb;          -- the last ad touch before signing up
alter table public.businesses add column if not exists attr_ip text;            -- for Meta to match a later payment
alter table public.businesses add column if not exists attr_user_agent text;
create index if not exists businesses_utm on public.businesses(utm_content, utm_campaign);

create table if not exists public.ad_insights (
  date date not null,
  ad_id text not null,
  ad_name text not null default '',
  adset_name text not null default '',
  campaign_name text not null default '',
  utm_campaign text,
  utm_content text,
  country text,
  spend numeric(14,2) not null default 0,
  currency text not null default '',
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  meta_registrations bigint not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, ad_id)
);
create index if not exists ad_insights_utm on public.ad_insights(utm_content);

create table if not exists public.marketing_settings (
  id boolean primary key default true check (id),
  kill_spend_no_signup numeric(14,2) not null default 3000,
  max_cost_per_signup numeric(14,2) not null default 1500,
  scale_min_signups integer not null default 3,
  ngn_per_usd numeric(14,2) not null default 1500,
  report_email text,
  reports_enabled boolean not null default true,
  -- the Meta connection, set in the dashboard (tokens encrypted by the app)
  meta_ad_account_id text,
  meta_pixel_id text,
  meta_access_token_enc text,
  meta_access_token_hint text,
  meta_capi_token_enc text,
  meta_capi_token_hint text,
  last_sync_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now()
);
insert into public.marketing_settings(id, meta_ad_account_id) values (true, '2167224513581774') on conflict (id) do nothing;

create table if not exists public.marketing_reports (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  period text not null default '6h',
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent', 'skipped', 'error'))
);
create index if not exists marketing_reports_recent on public.marketing_reports(sent_at desc);

alter table public.ad_insights enable row level security;
alter table public.marketing_settings enable row level security;
alter table public.marketing_reports enable row level security;
revoke all on public.ad_insights, public.marketing_settings, public.marketing_reports from anon;
grant select, insert, update, delete on public.ad_insights, public.marketing_settings, public.marketing_reports to authenticated, service_role;

do $$ begin
  create policy ad_insights_admin on public.ad_insights for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy marketing_settings_admin on public.marketing_settings for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy marketing_reports_admin on public.marketing_reports for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
exception when duplicate_object then null; end $$;

-- the attribution columns are set by the server only: members can't fake
-- where their business came from
create or replace function public.protect_attribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('role', true) = 'authenticated' and not public.is_platform_admin() then
    new.utm_source := old.utm_source; new.utm_medium := old.utm_medium; new.utm_campaign := old.utm_campaign;
    new.utm_content := old.utm_content; new.utm_term := old.utm_term; new.fbclid := old.fbclid; new.fbc := old.fbc; new.fbp := old.fbp;
    new.first_landing_url := old.first_landing_url; new.landed_at := old.landed_at; new.attr_last := old.attr_last;
    new.attr_ip := old.attr_ip; new.attr_user_agent := old.attr_user_agent;
  end if;
  return new;
end; $$;
drop trigger if exists businesses_protect_attribution on public.businesses;
create trigger businesses_protect_attribution before update on public.businesses for each row execute function public.protect_attribution();
