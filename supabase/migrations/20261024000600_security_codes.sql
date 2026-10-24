-- =====================================================================
-- PayTrail: emailed security codes (step-up verification)
--  * changing payment keys or bank details needs a 6-digit code sent to
--    the person's own email; a correct code opens a 10-minute window
--  * bank details are also guarded in the database, so the rule holds
--    even for requests that don't go through the app
-- Only the server (service role) reads or writes the codes.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.security_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  purpose text not null check (purpose in ('payment_keys','bank_details')),
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  verified_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists security_codes_lookup on public.security_codes(user_id, purpose, created_at desc);
alter table public.security_codes enable row level security;
revoke all on public.security_codes from anon, authenticated;

-- has the signed-in person verified a code for this business and purpose?
create or replace function public.step_up_ok(target uuid, what text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.security_codes
    where user_id = auth.uid() and business_id is not distinct from target and purpose = what and verified_until > now()
  );
$$;
revoke all on function public.step_up_ok(uuid, text) from public, anon;
grant execute on function public.step_up_ok(uuid, text) to authenticated;

create or replace function public.guard_business_billing() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- only the platform owner, the server, or PayTrail's own functions (which run
  -- as the table owner) change plan, status and counters
  if current_user in ('authenticated','anon') and not public.is_platform_admin() then
    new.plan_id := old.plan_id;
    new.subscription_status := old.subscription_status;
    new.trial_documents_used := old.trial_documents_used;
    new.trial_ends_at := old.trial_ends_at;
    new.current_period_end := old.current_period_end;
    new.quote_seq := old.quote_seq;
    new.invoice_seq := old.invoice_seq;
    new.receipt_seq := old.receipt_seq;
    new.kind := old.kind;
    new.created_by := old.created_by;
  end if;
  if current_user in ('authenticated','anon') then
    new.deletion_requested_at := old.deletion_requested_at;
    new.deletion_requested_by := old.deletion_requested_by;
    new.deletion_scheduled_for := old.deletion_scheduled_for;
    -- after onboarding, bank details only change with a verified email code
    if old.onboarded_at is not null
       and (new.bank_name, new.bank_account_name, new.bank_account_number) is distinct from (old.bank_name, old.bank_account_name, old.bank_account_number)
       and not public.step_up_ok(old.id, 'bank_details') then
      raise exception 'STEP_UP:bank_details';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
