-- =====================================================================
-- PayTrail: document templates, paper sizes and frozen branding
--  * each document and receipt records its template + paper size
--  * businesses save a default per document type (quote, invoice, receipt)
--  * when a document is issued, the business's branding and bank details
--    are frozen on it, so later changes never alter issued documents
-- Safe to run more than once.
-- =====================================================================

alter table public.businesses
  add column if not exists document_prefs jsonb not null default '{}'::jsonb;

alter table public.documents
  add column if not exists template text,
  add column if not exists paper text,
  add column if not exists layout jsonb not null default '{}'::jsonb,
  add column if not exists payment_instructions text not null default '',
  add column if not exists snapshot jsonb;

alter table public.receipts
  add column if not exists template text,
  add column if not exists paper text;

do $$ begin
  alter table public.documents add constraint documents_template_check check (template in ('essential','signature','executive','pos'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents add constraint documents_paper_check check (paper in ('a4','letter','a5','half','thermal80','thermal58'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.receipts add constraint receipts_template_check check (template in ('essential','signature','executive','pos'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.receipts add constraint receipts_paper_check check (paper in ('a4','letter','a5','half','thermal80','thermal58'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents add constraint documents_payment_instructions_len check (char_length(payment_instructions) <= 2000);
exception when duplicate_object then null; end $$;

-- which templates suit which documents and paper (mirrors lib/doc-templates.js)
create or replace function public.template_fits(kind text, tpl text, paper text) returns boolean
language sql immutable as $$
  select case tpl
    when 'pos' then kind in ('receipt','invoice') and paper in ('thermal80','thermal58')
    when 'executive' then paper in ('a4','letter','a5')
    else paper in ('a4','letter','a5','half')
  end;
$$;

-- a business's default template/paper for a document type
create or replace function public.document_default(b public.businesses, kind text) returns jsonb
language plpgsql stable as $$
declare
  p jsonb := coalesce(b.document_prefs -> kind, '{}'::jsonb);
  letter boolean := lower(coalesce(b.country, '')) in ('us','usa','united states','united states of america','ca','canada','mx','mexico');
  tpl text := coalesce(p->>'template', 'signature');
  paper text := coalesce(p->>'paper', case when kind = 'receipt' then (case when letter then 'half' else 'a5' end) else (case when letter then 'letter' else 'a4' end) end);
begin
  if not public.template_fits(kind, tpl, paper) then
    tpl := 'signature';
    paper := case when letter then 'letter' else 'a4' end;
  end if;
  return jsonb_build_object('template', tpl, 'paper', paper, 'layout', coalesce(p->'layout', '{}'::jsonb));
end; $$;

create or replace function public.business_snapshot(b public.businesses) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'name', b.name, 'legal_name', b.legal_name, 'email', b.email, 'phone', b.phone, 'website', b.website,
    'address', b.address, 'city', b.city, 'country', b.country, 'tax_id', b.tax_id,
    'logo_path', b.logo_path, 'brand_color', b.brand_color, 'footer_note', b.footer_note,
    'bank_name', b.bank_name, 'bank_account_name', b.bank_account_name, 'bank_account_number', b.bank_account_number,
    'frozen_at', now());
$$;

-- fills template/paper defaults and freezes branding when a document is issued
create or replace function public.documents_layout_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  def jsonb;
begin
  if new.template is null or new.paper is null or (new.snapshot is null and new.status not in ('draft','pending_approval')) then
    select * into b from public.businesses where id = new.business_id;
  end if;
  if new.template is null or new.paper is null then
    def := public.document_default(b, new.kind);
    new.template := coalesce(new.template, def->>'template');
    new.paper := coalesce(new.paper, def->>'paper');
    if new.layout = '{}'::jsonb then new.layout := coalesce(def->'layout', '{}'::jsonb); end if;
    if not public.template_fits(new.kind, new.template, new.paper) then
      new.template := def->>'template'; new.paper := def->>'paper';
    end if;
  end if;
  if new.snapshot is null and new.status not in ('draft','pending_approval') then
    new.snapshot := public.business_snapshot(b);
  end if;
  return new;
end; $$;
drop trigger if exists documents_layout on public.documents;
create trigger documents_layout before insert or update on public.documents
  for each row execute function public.documents_layout_defaults();

create or replace function public.receipts_layout_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  def jsonb;
begin
  if new.template is null or new.paper is null then
    select * into b from public.businesses where id = new.business_id;
    def := public.document_default(b, 'receipt');
    new.template := coalesce(new.template, def->>'template');
    new.paper := coalesce(new.paper, def->>'paper');
  end if;
  return new;
end; $$;
drop trigger if exists receipts_layout on public.receipts;
create trigger receipts_layout before insert on public.receipts
  for each row execute function public.receipts_layout_defaults();

-- documents issued before this migration: freeze their branding now
update public.documents d set snapshot = public.business_snapshot(b)
  from public.businesses b where b.id = d.business_id and d.snapshot is null and d.status not in ('draft','pending_approval');
update public.documents set template = template where template is null;
update public.receipts r set template = (public.document_default(b, 'receipt')->>'template'), paper = (public.document_default(b, 'receipt')->>'paper')
  from public.businesses b where b.id = r.business_id and r.template is null;

-- change one document's look. Drafts: anyone who can edit them. Issued
-- documents: people who can send. Branding stays frozen; this only changes
-- the template, paper, visible sections and payment instructions, and it is
-- recorded in the activity log.
create or replace function public.set_document_layout(doc_id uuid, tpl text, paper_size text, new_layout jsonb, instructions text)
returns void language plpgsql security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  my_role text;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found then raise exception 'Document not found'; end if;
  my_role := public.member_role(d.business_id);
  if my_role is null then raise exception 'Document not found'; end if;
  if d.status not in ('draft','pending_approval') and my_role not in ('owner','manager','finance') then
    raise exception 'Only people who can send documents can change an issued document''s layout';
  end if;
  if d.status = 'void' then raise exception 'This document has been voided'; end if;
  if not public.template_fits(d.kind, tpl, paper_size) then
    raise exception 'That template is not available for this document and paper size';
  end if;
  if new_layout is null or jsonb_typeof(new_layout) <> 'object' or pg_column_size(new_layout) > 4000 then
    raise exception 'Invalid layout';
  end if;
  update public.documents set template = tpl, paper = paper_size, layout = new_layout,
    payment_instructions = left(coalesce(instructions, ''), 2000), updated_at = now()
    where id = doc_id;
  if d.status not in ('draft','pending_approval') then
    insert into public.activity(business_id, document_id, actor_id, actor_label, action, detail)
      values (d.business_id, doc_id, auth.uid(), public.actor_label(d.business_id), 'document.layout_changed',
        jsonb_build_object('template', tpl, 'paper', paper_size));
  end if;
end; $$;

revoke all on function public.set_document_layout(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.set_document_layout(uuid, text, text, jsonb, text) to authenticated;
revoke all on function public.documents_layout_defaults() from public, anon, authenticated;
revoke all on function public.receipts_layout_defaults() from public, anon, authenticated;
revoke all on function public.document_default(public.businesses, text) from public, anon;
revoke all on function public.business_snapshot(public.businesses) from public, anon;
grant execute on function public.document_default(public.businesses, text) to authenticated, service_role;
grant execute on function public.business_snapshot(public.businesses) to authenticated, service_role;
grant execute on function public.template_fits(text, text, text) to authenticated, service_role;
