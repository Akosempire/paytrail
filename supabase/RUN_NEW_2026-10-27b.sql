-- Pricing, October 2026
--  1. Team goes from ₦7,500 to ₦10,000 a month (₦100,000 a year). Only plans
--     still at the old price change, so prices you edited in admin stay.
--  2. A Free plan: 5 sent quotes or invoices a month, 1 user, "Made with
--     Usetally" on documents. When a trial ends or a paid plan runs out, the
--     business drops to Free instead of being locked out.
--  3. A per-plan price for "File & pay for me" (empty = the platform price).
--  4. Founding spots: a hidden plan with spots can be chosen by anyone while
--     spots are left.

-- 1. Team price
update public.plans set price_minor = 1000000, updated_at = now() where name = 'Team' and currency = 'NGN' and billing_interval = 'month' and price_minor = 750000;
update public.plans set price_minor = 10000000, updated_at = now() where name = 'Team' and currency = 'NGN' and billing_interval = 'year' and price_minor = 7500000;

-- 3 + 4. new plan columns
alter table public.plans add column if not exists tax_filing_fee_minor bigint check (tax_filing_fee_minor is null or tax_filing_fee_minor >= 0);
alter table public.plans add column if not exists spots integer check (spots is null or spots >= 0);

-- 2. Free plan, one per currency
update public.plans set tagline = 'To get started', document_limit = 5, seat_limit = 1, allow_company = true,
  features = array['Quotes, invoices & receipts', 'Online payments', '“Made with Usetally” on documents'], active = true,
  sort_order = case currency when 'NGN' then 10 else 50 end, updated_at = now()
  where price_minor = 0 and name = 'Free';
insert into public.plans (name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order)
select 'Free', 'To get started', 0, c.currency, 'month', 5, 1, true, array['Quotes, invoices & receipts', 'Online payments', '“Made with Usetally” on documents'], true, c.sort
from (values ('NGN', 10), ('USD', 50)) as c(currency, sort)
where not exists (select 1 from public.plans p where p.price_minor = 0 and p.currency = c.currency and p.name = 'Free');

-- Founding: Team features for ₦60,000 a year, locked for life, first 100 businesses
update public.plans set spots = 100 where name = 'Founding' and spots is null;

-- how many founding spots are taken (any business currently on the plan)
create or replace function public.plan_spots_left(plan uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when p.spots is null then null
    else greatest(p.spots - (select count(*)::int from public.businesses b where b.plan_id = p.id), 0) end
  from public.plans p where p.id = plan;
$$;
grant execute on function public.plan_spots_left(uuid) to anon, authenticated, service_role;

-- the Free plan a business falls back to (its own currency first)
create or replace function public.free_plan_for(target uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.plans p, public.businesses b
  where b.id = target and p.active and p.price_minor = 0
  order by (p.currency = b.currency) desc, p.sort_order limit 1;
$$;

create or replace function public.business_allowance(target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  s public.platform_settings%rowtype;
  p public.plans%rowtype;
  used integer;
  free uuid;
  ended text;
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
    if p.price_minor = 0 then
      return jsonb_build_object('allowed', used < p.document_limit, 'reason', case when used < p.document_limit then 'free' else 'free_limit' end,
        'used', used, 'limit', p.document_limit, 'free', true);
    end if;
    return jsonb_build_object('allowed', used < p.document_limit, 'reason', case when used < p.document_limit then 'plan' else 'plan_limit' end,
      'used', used, 'limit', p.document_limit);
  end if;
  if b.subscription_status = 'trialing' then
    if s.trial_mode = 'documents' and b.trial_documents_used < s.trial_documents then
      return jsonb_build_object('allowed', true, 'reason', 'trial', 'used', b.trial_documents_used, 'limit', s.trial_documents, 'mode', 'documents');
    elsif s.trial_mode = 'days' and coalesce(b.trial_ends_at > now(), false) then
      return jsonb_build_object('allowed', true, 'reason', 'trial', 'ends_at', b.trial_ends_at, 'mode', 'days');
    end if;
    ended := 'trial_used';
  else
    ended := 'subscription_required';
  end if;
  -- the trial or the paid plan is over: carry on with the Free plan's allowance
  free := public.free_plan_for(target);
  if free is not null then
    select * into p from public.plans where id = free;
    select count(*) into used from public.documents
      where business_id = target and counted_toward_allowance and sent_at >= date_trunc('month', now());
    return jsonb_build_object('allowed', used < p.document_limit, 'reason', case when used < p.document_limit then 'free' else 'free_limit' end,
      'used', used, 'limit', p.document_limit, 'free', true, 'ended', ended);
  end if;
  return jsonb_build_object('allowed', false, 'reason', ended);
end; $$;
