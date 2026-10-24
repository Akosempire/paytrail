-- PayTrail pricing: naira and dollar plans, a 14-day free trial (then a paid
-- plan is needed to keep sending), and a hidden founding-customer plan. Safe to run more than once:
-- plans are only added when the plans table is still empty, and the founding plan
-- only when it doesn't exist yet. Edit prices any time in Admin → Plans & pricing.

-- A plan priced at 0 (if you ever create one) never expires
create or replace function public.extend_subscription(
  target uuid, new_plan uuid, pay_method text, pay_reference text, pay_amount bigint, pay_currency text, recorder uuid
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  p public.plans%rowtype;
  starts timestamptz;
  ends timestamptz;
begin
  select * into b from public.businesses where id = target for update;
  if not found then raise exception 'Business not found'; end if;
  select * into p from public.plans where id = new_plan;
  if not found then raise exception 'Plan not found'; end if;
  if p.price_minor = 0 then
    update public.businesses set plan_id = new_plan, subscription_status = 'active', current_period_end = null, updated_at = now() where id = target;
    insert into public.activity(business_id, actor_id, actor_label, action, detail)
      values (target, recorder, 'PayTrail billing', 'subscription.extended', jsonb_build_object('plan', p.name, 'until', null));
    return null;
  end if;
  -- paying early adds to the current period instead of losing days
  starts := case when b.subscription_status = 'active' and b.plan_id = new_plan and b.current_period_end > now() then b.current_period_end else now() end;
  ends := starts + case when p.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  update public.businesses set plan_id = new_plan, subscription_status = 'active', current_period_end = ends, updated_at = now() where id = target;
  insert into public.subscription_payments(business_id, plan_id, method, reference, amount_minor, currency, period_start, period_end, recorded_by)
    values (target, new_plan, pay_method, coalesce(pay_reference,''), pay_amount, pay_currency, starts, ends, recorder);
  insert into public.activity(business_id, actor_id, actor_label, action, detail)
    values (target, recorder, case when recorder is null then 'PayTrail billing' else 'PayTrail admin' end, 'subscription.extended',
      jsonb_build_object('plan', p.name, 'until', ends));
  return ends;
end; $$;
revoke all on function public.extend_subscription(uuid,uuid,text,text,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.extend_subscription(uuid,uuid,text,text,bigint,text,uuid) to service_role;

-- 14-day trial for new businesses, unless you already changed the trial yourself
alter table public.platform_settings alter column trial_mode set default 'days';
update public.platform_settings set trial_mode = 'days', trial_days = 14
  where trial_mode = 'documents' and trial_documents = 2;

-- default plans (amounts in kobo / cents)
insert into public.plans (name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order)
select * from (values
  ('Solo',     'For freelancers',                300000::bigint, 'NGN', 'month',  50, 1,  false, array['Online payments','Hidden costs and profit per job','Your logo and colours'], true, 20),
  ('Solo',     'For freelancers, billed yearly', 3000000::bigint, 'NGN', 'year',   50, 1,  false, array['2 months free','Online payments','Hidden costs and profit per job'], true, 21),
  ('Team',     'For small companies',           750000::bigint, 'NGN', 'month', 200, 5,  true,  array['Approvals for junior staff','Choose who sees costs','Online payments'], true, 30),
  ('Team',     'For small companies, billed yearly', 7500000::bigint, 'NGN', 'year', 200, 5, true, array['2 months free','Approvals for junior staff','Choose who sees costs'], true, 31),
  ('Business', 'For growing finance teams',     2000000::bigint, 'NGN', 'month', null, 15, true,  array['Priority support','Everything in Team'], true, 40),
  ('Business', 'For growing finance teams, billed yearly', 20000000::bigint, 'NGN', 'year', null, 15, true, array['2 months free','Priority support','Everything in Team'], true, 41),
  ('Solo',     'For freelancers',                   500::bigint, 'USD', 'month',  50, 1,  false, array['Online payments with Stripe','Hidden costs and profit per job','Your logo and colours'], true, 60),
  ('Solo',     'For freelancers, billed yearly',    5000::bigint, 'USD', 'year',   50, 1,  false, array['2 months free','Online payments with Stripe','Hidden costs and profit per job'], true, 61),
  ('Team',     'For small companies',               1500::bigint, 'USD', 'month', 200, 5,  true,  array['Approvals for junior staff','Choose who sees costs','Online payments with Stripe'], true, 70),
  ('Team',     'For small companies, billed yearly', 15000::bigint, 'USD', 'year', 200, 5, true, array['2 months free','Approvals for junior staff','Choose who sees costs'], true, 71),
  ('Business', 'For growing finance teams',         3900::bigint, 'USD', 'month', null, 15, true,  array['Priority support','Everything in Team'], true, 80),
  ('Business', 'For growing finance teams, billed yearly', 39000::bigint, 'USD', 'year', null, 15, true, array['2 months free','Priority support','Everything in Team'], true, 81)
) as v(name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order)
where not exists (select 1 from public.plans);

-- founding customers: Team features at NGN 60,000 a year, hidden from the plan
-- list, assigned by the platform owner, price locked even if public prices go up
insert into public.plans (name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order)
select 'Founding', 'Founding customer: Team features, price locked for life', 6000000, 'NGN', 'year', 200, 5, true,
  array['Founding customer: price locked for life','Approvals for junior staff','Choose who sees costs','Online payments'], false, 5
where not exists (select 1 from public.plans where name in ('Founding', 'Founding Solo'));

-- no free-forever plan: after the 14-day trial, businesses choose a paid plan
update public.plans set active = false where price_minor = 0 and name = 'Free';
