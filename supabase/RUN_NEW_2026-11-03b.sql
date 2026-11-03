-- Your default terms (Settings → Business & branding) on every quote and
-- invoice, whichever way it was made: the builder, a converted quote, a
-- repeating invoice, the AI assistant or offline sync. A document whose terms
-- are left blank while it's still being prepared gets the default. Sent
-- documents are never changed, and TrackOja POS sales stay without terms.
-- To leave terms off one document, untick "Terms" under Templates → Show on
-- the document.
create or replace function public.fill_default_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.terms), '') = ''
     and new.kind in ('quote', 'invoice')
     and coalesce(new.source, 'app') <> 'pos'
     and (tg_op = 'INSERT' or old.status in ('draft', 'pending_approval')) then
    select coalesce(default_terms, '') into new.terms from public.businesses where id = new.business_id;
  end if;
  return new;
end; $$;

drop trigger if exists documents_default_terms on public.documents;
create trigger documents_default_terms before insert or update of terms, status on public.documents
  for each row execute function public.fill_default_terms();
