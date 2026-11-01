-- Free plan with no document limit (left empty in Admin → Plans) = unlimited.
-- Before this, a business whose trial had ended stayed blocked, because
-- "used < empty limit" isn't true. The trial limit itself is always read live
-- from Admin → Settings, so changing it applies to every business at once.
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
    -- an empty limit on the Free plan means unlimited
    if p.document_limit is null then
      return jsonb_build_object('allowed', true, 'reason', 'free', 'limit', null, 'free', true, 'ended', ended);
    end if;
    select count(*) into used from public.documents
      where business_id = target and counted_toward_allowance and sent_at >= date_trunc('month', now());
    return jsonb_build_object('allowed', used < p.document_limit, 'reason', case when used < p.document_limit then 'free' else 'free_limit' end,
      'used', used, 'limit', p.document_limit, 'free', true, 'ended', ended);
  end if;
  return jsonb_build_object('allowed', false, 'reason', ended);
end; $$;

grant execute on function public.business_allowance(uuid) to authenticated, service_role;
