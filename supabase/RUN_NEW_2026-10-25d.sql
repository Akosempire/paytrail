-- Usetally: run once in Supabase → SQL Editor (2026-10-25, Ledger and Bold receipt templates)
-- Two more receipt templates: "ledger" and "bold" (receipts only, sheet paper).
alter table public.documents drop constraint if exists documents_template_check;
alter table public.documents add constraint documents_template_check
  check (template in ('essential','signature','executive','pos','ledger','bold'));
alter table public.receipts drop constraint if exists receipts_template_check;
alter table public.receipts add constraint receipts_template_check
  check (template in ('essential','signature','executive','pos','ledger','bold'));

-- which templates suit which documents and paper (mirrors lib/doc-templates.js)
create or replace function public.template_fits(kind text, tpl text, paper text) returns boolean
language sql immutable as $$
  select case tpl
    when 'pos' then kind in ('receipt','invoice') and paper in ('thermal80','thermal58')
    when 'executive' then paper in ('a4','letter','a5')
    when 'ledger' then kind = 'receipt' and paper in ('a4','letter','a5','half')
    when 'bold' then kind = 'receipt' and paper in ('a4','letter','a5','half')
    else paper in ('a4','letter','a5','half')
  end;
$$;
