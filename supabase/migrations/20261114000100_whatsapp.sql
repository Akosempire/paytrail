-- WhatsApp to invoice: business owners link their WhatsApp number and make
-- quotes and invoices, check who owes them, mark invoices paid and send
-- documents to customers by chatting with the Usetally WhatsApp number.
-- Twilio carries the messages; the keys are set in Admin -> Integrations ->
-- WhatsApp and stored encrypted (AES-256-GCM with APP_ENCRYPTION_KEY), read
-- only by the server with the service key. Paid plans only (feature
-- "whatsapp"). Safe to run more than once.

-- 1 -- platform settings (Admin -> Integrations -> WhatsApp)
alter table public.platform_settings
  add column if not exists wa_enabled boolean not null default false,
  add column if not exists wa_account_sid text not null default '',
  add column if not exists wa_auth_token_enc text,
  add column if not exists wa_token_hint text,
  add column if not exists wa_from text not null default '',            -- the bot's WhatsApp number, +14155238886
  add column if not exists wa_account_name text,
  add column if not exists wa_checked_at timestamptz,
  add column if not exists wa_tpl_invoice text not null default '',     -- Twilio Content SIDs (HX...) of approved templates
  add column if not exists wa_tpl_quote text not null default '',
  add column if not exists wa_tpl_receipt text not null default '',
  add column if not exists wa_ai_provider text not null default 'off',  -- off | anthropic | openai
  add column if not exists wa_ai_key_enc text,
  add column if not exists wa_ai_key_hint text,
  add column if not exists wa_ai_model text not null default '',
  add column if not exists wa_ai_checked_at timestamptz;

alter table public.platform_settings drop constraint if exists platform_settings_wa_ai_provider_check;
alter table public.platform_settings add constraint platform_settings_wa_ai_provider_check
  check (wa_ai_provider in ('off', 'anthropic', 'openai'));

-- the non-secret parts can be read by admins; the token and AI key stay server-only
grant select (wa_enabled, wa_account_sid, wa_token_hint, wa_from, wa_account_name, wa_checked_at,
  wa_tpl_invoice, wa_tpl_quote, wa_tpl_receipt, wa_ai_provider, wa_ai_key_hint, wa_ai_model, wa_ai_checked_at)
  on public.platform_settings to authenticated;

-- replacing a working Twilio token or AI key needs a security code, like email keys
alter table public.security_codes drop constraint if exists security_codes_purpose_check;
alter table public.security_codes add constraint security_codes_purpose_check
  check (purpose in ('payment_keys', 'bank_details', 'email_settings', 'storage_settings', 'whatsapp_settings'));

-- 2 -- linked numbers: one WhatsApp number works for one person in one business
create table if not exists public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^[0-9]{8,15}$'),           -- digits only, with country code: 2348012345678
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists whatsapp_links_business_idx on public.whatsapp_links(business_id);
create index if not exists whatsapp_links_user_idx on public.whatsapp_links(user_id);

-- one-time link codes (shown in Settings -> WhatsApp, valid 10 minutes). Only a hash is kept.
create table if not exists public.whatsapp_link_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_link_codes_user_idx on public.whatsapp_link_codes(user_id, created_at desc);

-- the conversation so far (guided step, a change waiting for YES, recent turns for the AI)
create table if not exists public.whatsapp_sessions (
  phone text primary key,
  state jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- every message in and out: stops Twilio retries being handled twice, limits
-- how fast one number can message, and lets admins see usage. Bodies are kept 30 days.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  message_sid text unique,
  phone text not null,
  direction text not null check (direction in ('in', 'out', 'customer')),
  business_id uuid references public.businesses(id) on delete set null,
  body text not null default '',
  status text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages(phone, created_at desc);
create index if not exists whatsapp_messages_created_idx on public.whatsapp_messages(created_at desc);

alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_link_codes enable row level security;
alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_links, public.whatsapp_link_codes, public.whatsapp_sessions, public.whatsapp_messages from anon, authenticated;
grant all on public.whatsapp_links, public.whatsapp_link_codes, public.whatsapp_sessions, public.whatsapp_messages to service_role;

-- people see and remove their own linked numbers; linking happens on the server
grant select, delete on public.whatsapp_links to authenticated;
drop policy if exists "own whatsapp links" on public.whatsapp_links;
create policy "own whatsapp links" on public.whatsapp_links for select using (user_id = auth.uid());
drop policy if exists "remove own whatsapp links" on public.whatsapp_links;
create policy "remove own whatsapp links" on public.whatsapp_links for delete using (user_id = auth.uid());

-- old message bodies are blanked after 30 days, old codes removed (called by the daily job)
create or replace function public.whatsapp_cleanup() returns void
language sql security definer set search_path = public as $$
  update public.whatsapp_messages set body = '' where created_at < now() - interval '30 days' and body <> '';
  delete from public.whatsapp_link_codes where expires_at < now() - interval '1 day';
  delete from public.whatsapp_sessions where updated_at < now() - interval '30 days';
$$;
revoke all on function public.whatsapp_cleanup() from public, anon, authenticated;
grant execute on function public.whatsapp_cleanup() to service_role;

-- 3 -- WhatsApp is a paid feature: the trial and paid plans get it, Free doesn't
create or replace function public.business_features(target uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  everything constant text[] := array['ai_full', 'auto_reminders', 'scheduled_sending', 'premium_templates', 'whatsapp'];
  a jsonb;
  b public.businesses%rowtype;
  p public.plans%rowtype;
  reason text;
begin
  if (auth.uid() is null and coalesce(current_setting('request.jwt.claim.role', true), '') = 'anon')
     or (auth.uid() is not null and not public.is_member(target) and not public.is_platform_admin()) then
    return '{}';
  end if;
  select * into b from public.businesses where id = target;
  if not found then return '{}'; end if;
  a := public.business_allowance(target);
  reason := a->>'reason';
  if reason = 'trial' then return everything; end if;
  if reason in ('plan', 'plan_limit') then
    select * into p from public.plans where id = b.plan_id;
    if p.id is null then return everything; end if;
    return coalesce(p.features_included, everything);
  end if;
  if reason in ('free', 'free_limit') then
    select * into p from public.plans where id = b.plan_id and price_minor = 0 and b.subscription_status = 'active';
    if p.id is null then select * into p from public.plans where id = public.free_plan_for(target); end if;
    return coalesce(p.features_included, '{}');
  end if;
  return '{}';
end; $$;
revoke all on function public.business_features(uuid) from public, anon;
grant execute on function public.business_features(uuid) to authenticated, service_role;

-- paid plans whose features were ticked by hand get WhatsApp too (untick it in Admin -> Plans)
update public.plans set features_included = features_included || array['whatsapp']
where features_included is not null and price_minor > 0 and not ('whatsapp' = any(features_included));
