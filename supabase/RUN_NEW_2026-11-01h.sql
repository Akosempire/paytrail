-- Which AI assistant made a document (ChatGPT, Claude, Grok…), so the
-- dashboard can show "Made by ChatGPT" on drafts waiting for review.
-- Empty for everything made in Usetally itself.
alter table public.documents add column if not exists created_via text not null default '';
do $$ begin
  alter table public.documents add constraint documents_created_via_len check (char_length(created_via) <= 60);
exception when duplicate_object then null; end $$;
