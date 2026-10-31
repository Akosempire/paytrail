-- Usetally: all updates from 1 Nov (part 2) in one file: templates (d) and currency per document (e). Safe to run more than once.

-- ================= RUN_NEW_2026-11-01d.sql =================
-- Usetally: the "Notebook" and "Case file" templates for quotes, invoices and
-- receipts (2026-11-01). Safe to run more than once.
alter table public.documents drop constraint if exists documents_template_check;
alter table public.documents add constraint documents_template_check
  check (template in ('essential','signature','executive','pos','ledger','bold','merchant','notebook','casefile'));
alter table public.receipts drop constraint if exists receipts_template_check;
alter table public.receipts add constraint receipts_template_check
  check (template in ('essential','signature','executive','pos','ledger','bold','merchant','notebook','casefile'));

-- which templates suit which documents and paper (mirrors lib/doc-templates.js)
create or replace function public.template_fits(kind text, tpl text, paper text) returns boolean
language sql immutable as $$
  select case tpl
    when 'pos' then kind in ('receipt','invoice') and paper in ('thermal80','thermal58')
    when 'executive' then paper in ('a4','letter','a5')
    when 'ledger' then kind = 'receipt' and paper in ('a4','letter','a5','half')
    when 'bold' then kind = 'receipt' and paper in ('a4','letter','a5','half')
    when 'merchant' then paper in ('a4','letter','a5','half')
    when 'notebook' then paper in ('a4','letter','a5','half')
    when 'casefile' then paper in ('a4','letter','a5','half')
    when 'essential' then paper in ('a4','letter','a5','half')
    when 'signature' then paper in ('a4','letter','a5','half')
    else false
  end;
$$;

-- ================= RUN_NEW_2026-11-01e.sql =================
-- Usetally: a quote or invoice can be in a different currency from the
-- business default (picked in the builder). Only while it's a draft and
-- nothing has been paid. Safe to run more than once.
create or replace function public.set_document_currency(doc_id uuid, cur text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or public.member_role(d.business_id) is null then raise exception 'Document not found'; end if;
  if d.status not in ('draft','pending_approval') then raise exception 'The currency can only be changed on a draft.'; end if;
  if coalesce(d.amount_paid_minor, 0) > 0 then raise exception 'This document has payments, so its currency can''t change.'; end if;
  if coalesce(cur, '') !~ '^[A-Z]{3}$' then raise exception 'Choose a currency.'; end if;
  update public.documents set currency = cur, updated_at = now() where id = d.id and currency is distinct from cur;
end; $$;
revoke all on function public.set_document_currency(uuid, text) from public, anon;
grant execute on function public.set_document_currency(uuid, text) to authenticated;
