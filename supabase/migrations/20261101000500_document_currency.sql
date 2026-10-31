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
