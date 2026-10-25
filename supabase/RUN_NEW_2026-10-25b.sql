-- Usetally: run once in Supabase → SQL Editor (2026-10-25, email settings in the admin dashboard)
-- Email (Brevo) set up from Admin → Settings instead of Vercel variables.
-- The API key is stored encrypted (AES-256-GCM with APP_ENCRYPTION_KEY) and is
-- only ever read by the server with the service key.
alter table public.platform_settings
  add column if not exists email_api_key_enc text,
  add column if not exists email_key_hint text,
  add column if not exists email_from_name text not null default 'Usetally',
  add column if not exists email_from_address text not null default '',
  add column if not exists email_account text,
  add column if not exists email_checked_at timestamptz;

-- admins can see the non-secret parts; the key itself stays server-only
grant select (email_key_hint, email_from_name, email_from_address, email_account, email_checked_at)
  on public.platform_settings to authenticated;

-- changing the email key later needs a security code, like payment keys
alter table public.security_codes drop constraint if exists security_codes_purpose_check;
alter table public.security_codes add constraint security_codes_purpose_check
  check (purpose in ('payment_keys','bank_details','email_settings'));
