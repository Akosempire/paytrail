-- Usetally: Cloudflare R2 set up from Admin → Trial & billing (2026-10-25)
-- The Secret Access Key is stored encrypted (APP_ENCRYPTION_KEY) and only read
-- by the server with the service key. Safe to run more than once.
alter table public.platform_settings
  add column if not exists r2_account_id text,
  add column if not exists r2_bucket text,
  add column if not exists r2_access_key_id text,
  add column if not exists r2_secret_enc text,
  add column if not exists r2_key_hint text,
  add column if not exists r2_checked_at timestamptz;

-- changing working storage settings needs a security code, like email settings
alter table public.security_codes drop constraint if exists security_codes_purpose_check;
alter table public.security_codes add constraint security_codes_purpose_check
  check (purpose in ('payment_keys','bank_details','email_settings','storage_settings'));
