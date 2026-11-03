-- Security review, 3 Nov 2026. Safe to run more than once.
--  1. Bank details: the emailed-code check can't be switched off by clearing
--     onboarded_at, and logo/signature paths must be this business's own files
--     (no outside or internal web addresses for the PDF maker to fetch).
--  2. Attached files: a file row can only point at this document's own folder,
--     and the browser can only change "shared".
--  3. Offline sync records are written by the server only.
--  4. Targeted announcements don't reveal which other businesses got them.

-- 1 -------------------------------------------------------------------------
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
    -- once onboarded, always onboarded: otherwise clearing it would skip the check below
    if old.onboarded_at is not null then new.onboarded_at := old.onboarded_at; end if;
    -- after onboarding, bank details only change with a verified email code
    if old.onboarded_at is not null
       and (new.bank_name, new.bank_account_name, new.bank_account_number) is distinct from (old.bank_name, old.bank_account_name, old.bank_account_number)
       and not public.step_up_ok(old.id, 'bank_details') then
      raise exception 'STEP_UP:bank_details';
    end if;
    -- images are this business's own uploads ("r2:<id>/logo-…" or "<id>/logo-…"), never a web address
    if new.logo_path is distinct from old.logo_path and new.logo_path is not null
       and new.logo_path !~ ('^(r2:)?' || old.id::text || '/logo-[0-9]+\.(png|jpg|webp|svg)$') then
      raise exception 'Logo must be uploaded in Settings';
    end if;
    if new.signature_path is distinct from old.signature_path and new.signature_path is not null
       and new.signature_path !~ ('^(r2:)?' || old.id::text || '/signature-[0-9]+\.(png|jpg|webp|svg)$') then
      raise exception 'Signature must be uploaded in Settings';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- 2 -------------------------------------------------------------------------
drop policy if exists "members add files" on public.document_files;
create policy "members add files" on public.document_files for insert
  with check (
    public.has_role(business_id, array['owner','manager','finance','junior_finance'])
    and uploaded_by = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and d.business_id = document_files.business_id)
    and storage_key like business_id::text || '/docs/' || document_id::text || '/%'
    and storage_key !~ '\.\.'
  );
revoke update on public.document_files from authenticated;
grant update (shared) on public.document_files to authenticated;

-- 3 -------------------------------------------------------------------------
drop policy if exists "members record offline ops" on public.offline_ops;
revoke insert on public.offline_ops from authenticated;

-- 4 -------------------------------------------------------------------------
-- the dashboard asks for its own business's news; the list of businesses stays private
create or replace function public.news_for(target uuid)
returns table (id uuid, title text, body text, link_href text, link_label text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.body, a.link_href, a.link_label, a.published_at
  from public.announcements a
  where public.is_member(target) and a.active
    and (a.audience = 'all' or target = any(a.business_ids))
  order by a.published_at desc nulls last
  limit 10;
$$;
revoke all on function public.news_for(uuid) from public, anon;
grant execute on function public.news_for(uuid) to authenticated;

revoke select on public.announcements from authenticated;
grant select (id, title, body, link_href, link_label, active, published_at, audience, created_at, updated_at) on public.announcements to authenticated;
