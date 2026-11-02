-- Paid features: what each plan unlocks (Admin → Plans tick-boxes).
--   ai_full            AI & MCP (ChatGPT, Claude, Grok). Not on Free at all.
--   auto_reminders     automatic invoice reminders (the manual Remind button stays free)
--   scheduled_sending  scheduled sends and repeating invoices
--   premium_templates  every template (Free: Essential and Signature, any colour)
-- An empty value (null) means the default: paid plans get everything, the Free
-- plan gets none of these. The trial always gets everything.

alter table public.plans add column if not exists features_included text[];

create or replace function public.business_features(target uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  everything constant text[] := array['ai_full', 'auto_reminders', 'scheduled_sending', 'premium_templates'];
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
    -- on the Free plan itself, or carried over to it after a trial / paid plan ended
    select * into p from public.plans where id = b.plan_id and price_minor = 0 and b.subscription_status = 'active';
    if p.id is null then select * into p from public.plans where id = public.free_plan_for(target); end if;
    return coalesce(p.features_included, '{}');
  end if;
  return '{}';
end; $$;

revoke all on function public.business_features(uuid) from public, anon;
grant execute on function public.business_features(uuid) to authenticated, service_role;

-- Repeating invoices pause while the business isn't on a plan with them: the
-- period is skipped (not saved up), so upgrading doesn't send a backlog.
create or replace function public.run_due_recurrences(as_of date default (now() at time zone 'Africa/Lagos')::date, max_rows integer default 50)
returns table (source_id uuid, new_id uuid, period date, send_id uuid)
language plpgsql security definer set search_path = public as $$
declare src public.documents%rowtype; fresh uuid; made uuid; num text; per date; q uuid;
begin
  for src in
    select * from public.documents x
    where x.recur_interval is not null and x.recur_next_on <= as_of and x.status <> 'void' and x.kind = 'invoice'
    order by x.recur_next_on
    limit greatest(1, least(coalesce(max_rows, 50), 500))
    for update skip locked
  loop
    per := src.recur_next_on;
    made := null; q := null;
    if 'scheduled_sending' = any(public.business_features(src.business_id))
       and not exists (select 1 from public.documents where recur_source_id = src.id and recur_period = per) then
      fresh := gen_random_uuid();
      num := public.next_document_number(src.business_id, 'invoice');
      insert into public.documents
        select (jsonb_populate_record(null::public.documents, to_jsonb(src) || jsonb_build_object(
          'id', fresh, 'number', num, 'status', 'draft', 'access_token', encode(gen_random_bytes(24), 'hex'),
          'issue_date', per, 'due_date', case when src.due_date is null then null else per + (src.due_date - src.issue_date) end,
          'valid_until', null, 'amount_paid_minor', 0, 'counted_toward_allowance', false, 'snapshot', null,
          'sent_at', null, 'viewed_at', null, 'paid_at', null, 'voided_at', null, 'accepted_at', null, 'accepted_name', '',
          'declined_at', null, 'decline_reason', '', 'submitted_by', null, 'approved_by', null, 'approved_at', null,
          'source_quote_id', null, 'converted_invoice_id', null, 'source', 'app', 'source_ref', null,
          'recur_interval', null, 'recur_next_on', null, 'recur_day', null, 'recur_auto_send', false, 'recur_by', null,
          'recur_source_id', src.id, 'recur_period', per, 'view_notified_at', null,
          'created_by', coalesce(src.recur_by, src.created_by), 'created_at', now(), 'updated_at', now()))).*
        on conflict do nothing
        returning id into made;
      if made is not null then
        insert into public.document_items
          select (jsonb_populate_record(null::public.document_items, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'document_id', made))).*
          from public.document_items i where i.document_id = src.id;
        insert into public.document_costs
          select (jsonb_populate_record(null::public.document_costs, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'document_id', made))).*
          from public.document_costs c where c.document_id = src.id;
        perform public.recalculate_document(made);
        insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
          values (src.business_id, made, src.recur_by, public.actor_label_for(src.business_id, src.recur_by), 'document.created',
            jsonb_build_object('repeat_of', src.number)),
            (src.business_id, src.id, src.recur_by, public.actor_label_for(src.business_id, src.recur_by), 'document.recurred',
            jsonb_build_object('number', num, 'new_id', made));
        if src.recur_auto_send and coalesce(src.customer_email, '') <> '' then
          insert into public.document_sends(business_id, document_id, kind, to_email, send_after, mark_on_send, created_by)
            values (src.business_id, made, 'recurring', lower(src.customer_email), now(), true, src.recur_by)
            returning id into q;
        end if;
      end if;
    end if;
    update public.documents set recur_next_on = public.next_recurrence(per, src.recur_interval, src.recur_day) where id = src.id;
    source_id := src.id; new_id := made; period := per; send_id := q;
    return next;
  end loop;
end; $$;
revoke all on function public.run_due_recurrences(date, integer) from public, anon, authenticated;
grant execute on function public.run_due_recurrences(date, integer) to service_role;

-- Automatic reminders pause on Free (the rules are kept; the manual Remind
-- button is separate and stays free). Missed ones aren't saved up.
create or replace function public.due_reminders(as_of date default (now() at time zone 'Africa/Lagos')::date, max_rows integer default 200)
returns table (document_id uuid, rule_id uuid, business_id uuid, offset_days integer)
language sql stable security definer set search_path = public as $$
  with allowed as (
    select b.id from public.businesses b
    where b.reminders_enabled and 'auto_reminders' = any(public.business_features(b.id))
  )
  select d.id, r.id, d.business_id, r.offset_days
  from public.documents d
  join allowed a on a.id = d.business_id
  join public.reminder_rules r on r.business_id = d.business_id and r.enabled
  where d.kind = 'invoice'
    and d.status in ('sent', 'viewed', 'partially_paid')
    and d.due_date is not null
    and d.customer_email <> ''
    and d.due_date + r.offset_days <= as_of
    and d.due_date + r.offset_days > as_of - 3
    and not exists (select 1 from public.reminder_log l where l.document_id = d.id and l.rule_id = r.id)
  order by d.due_date, r.offset_days
  limit greatest(1, least(max_rows, 1000));
$$;
revoke all on function public.due_reminders(date, integer) from public, anon, authenticated;
grant execute on function public.due_reminders(date, integer) to service_role;
