-- =====================================================================
-- PayTrail: data protection (NDPA 2023 / GDPR)
--  * owners can schedule their business for deletion (30-day grace period)
--  * deletion purges everything except PayTrail's own subscription
--    billing records, which are kept (with the business name) for tax
-- Safe to run more than once.
-- =====================================================================

alter table public.businesses
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_scheduled_for timestamptz;
create index if not exists businesses_deletion_idx on public.businesses(deletion_scheduled_for) where deletion_scheduled_for is not null;

-- PayTrail's own billing records outlive a deleted business (tax/accounting)
alter table public.subscription_payments add column if not exists business_name text not null default '';
update public.subscription_payments sp set business_name = b.name
  from public.businesses b where b.id = sp.business_id and sp.business_name = '';
alter table public.subscription_payments alter column business_id drop not null;
alter table public.subscription_payments drop constraint if exists subscription_payments_business_id_fkey;
alter table public.subscription_payments add constraint subscription_payments_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete set null;

create or replace function public.subscription_payment_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.business_name = '' and new.business_id is not null then
    select name into new.business_name from public.businesses where id = new.business_id;
    new.business_name := coalesce(new.business_name, '');
  end if;
  return new;
end; $$;
revoke all on function public.subscription_payment_name() from public, anon, authenticated;
drop trigger if exists subscription_payments_name on public.subscription_payments;
create trigger subscription_payments_name before insert on public.subscription_payments
  for each row execute function public.subscription_payment_name();

-- the deletion columns can only change through the functions below
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
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- a business waiting to be deleted can't send new quotes or invoices
create or replace function public.business_allowance(target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  s public.platform_settings%rowtype;
  p public.plans%rowtype;
  used integer;
begin
  select * into b from public.businesses where id = target;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'not_found'); end if;
  if (auth.uid() is null and coalesce(current_setting('request.jwt.claim.role', true), '') = 'anon')
     or (auth.uid() is not null and not public.is_member(target) and not public.is_platform_admin()) then
    return jsonb_build_object('allowed', false, 'reason', 'forbidden');
  end if;
  select * into s from public.platform_settings where id;
  if b.subscription_status = 'suspended' then
    return jsonb_build_object('allowed', false, 'reason', 'suspended');
  end if;
  if b.deletion_requested_at is not null then
    return jsonb_build_object('allowed', false, 'reason', 'deletion_pending', 'deletes_at', b.deletion_scheduled_for);
  end if;
  if b.subscription_status = 'active' and (b.current_period_end is null or b.current_period_end > now()) then
    select * into p from public.plans where id = b.plan_id;
    if p.id is null or p.document_limit is null then
      return jsonb_build_object('allowed', true, 'reason', 'plan', 'limit', null);
    end if;
    select count(*) into used from public.documents
      where business_id = target and counted_toward_allowance and sent_at >= date_trunc('month', now());
    return jsonb_build_object('allowed', used < p.document_limit, 'reason', case when used < p.document_limit then 'plan' else 'plan_limit' end,
      'used', used, 'limit', p.document_limit);
  end if;
  if b.subscription_status = 'trialing' then
    if s.trial_mode = 'documents' then
      return jsonb_build_object('allowed', b.trial_documents_used < s.trial_documents,
        'reason', case when b.trial_documents_used < s.trial_documents then 'trial' else 'trial_used' end,
        'used', b.trial_documents_used, 'limit', s.trial_documents, 'mode', 'documents');
    elsif s.trial_mode = 'days' then
      return jsonb_build_object('allowed', coalesce(b.trial_ends_at > now(), false),
        'reason', case when coalesce(b.trial_ends_at > now(), false) then 'trial' else 'trial_used' end,
        'ends_at', b.trial_ends_at, 'mode', 'days');
    end if;
    return jsonb_build_object('allowed', false, 'reason', 'trial_used', 'mode', 'none');
  end if;
  return jsonb_build_object('allowed', false, 'reason', 'subscription_required');
end; $$;

-- owner schedules deletion; they must type the business name to confirm
create or replace function public.request_business_deletion(target uuid, confirm_name text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  due timestamptz := now() + interval '30 days';
begin
  if not public.has_role(target, array['owner']) then raise exception 'Only the owner can delete this business.'; end if;
  select * into b from public.businesses where id = target for update;
  if lower(btrim(coalesce(confirm_name, ''))) <> lower(btrim(b.name)) then
    raise exception 'Type the business name exactly to confirm.';
  end if;
  if b.deletion_requested_at is not null then return b.deletion_scheduled_for; end if;
  update public.businesses set deletion_requested_at = now(), deletion_requested_by = auth.uid(), deletion_scheduled_for = due
    where id = target;
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (target, auth.uid(), coalesce((select full_name from public.memberships where business_id = target and user_id = auth.uid()), ''),
      'business.deletion_requested', jsonb_build_object('deletes_at', due));
  return due;
end; $$;

create or replace function public.cancel_business_deletion(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(target, array['owner']) and not public.is_platform_admin() then
    raise exception 'Only the owner can cancel the deletion.';
  end if;
  update public.businesses set deletion_requested_at = null, deletion_requested_by = null, deletion_scheduled_for = null
    where id = target;
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (target, auth.uid(), coalesce((select full_name from public.memberships where business_id = target and user_id = auth.uid()), ''),
      'business.deletion_cancelled', '{}'::jsonb);
end; $$;

-- server only: permanently removes one business that is due. Every table
-- that belongs to the business is removed by its "on delete cascade" link.
create or replace function public.purge_business(target uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.businesses where id = target and deletion_scheduled_for is not null and deletion_scheduled_for <= now();
  return found;
end; $$;

revoke all on function public.request_business_deletion(uuid, text) from public, anon;
revoke all on function public.cancel_business_deletion(uuid) from public, anon;
revoke all on function public.purge_business(uuid) from public, anon, authenticated;
grant execute on function public.request_business_deletion(uuid, text) to authenticated;
grant execute on function public.cancel_business_deletion(uuid) to authenticated;
grant execute on function public.purge_business(uuid) to service_role;
