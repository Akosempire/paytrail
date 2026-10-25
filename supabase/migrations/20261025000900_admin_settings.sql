-- Usetally: analytics, company & legal details and admin alert recipients,
-- set in the admin dashboard instead of Vercel variables (2026-10-25).
-- Safe to run more than once.
alter table public.platform_settings
  add column if not exists analytics_sabilytics_site text,
  add column if not exists analytics_sabilytics_domain text,
  add column if not exists analytics_ga_id text,
  add column if not exists legal_company text,
  add column if not exists legal_address text,
  add column if not exists legal_email text,
  add column if not exists legal_law text,
  add column if not exists legal_courts text,
  add column if not exists legal_data_region text,
  add column if not exists alert_emails text;

-- keep the Sabilytics site that was in the code until now
update public.platform_settings
  set analytics_sabilytics_site = '9h09ynxhgfc3', analytics_sabilytics_domain = 'usetally.cc'
  where id = true and analytics_sabilytics_site is null;
