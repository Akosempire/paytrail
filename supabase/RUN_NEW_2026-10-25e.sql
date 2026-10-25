-- Usetally: files attached to quotes and invoices (2026-10-25)
-- Contracts, delivery notes, proof of payment… The files themselves live in
-- Cloudflare R2; this table lists them. Safe to run more than once.

create table if not exists public.document_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 4194304),
  storage_key text not null unique,
  shared boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists document_files_document_idx on public.document_files(document_id, created_at);
create index if not exists document_files_business_idx on public.document_files(business_id);

alter table public.document_files enable row level security;

drop policy if exists "members read files" on public.document_files;
create policy "members read files" on public.document_files for select
  using (public.is_member(business_id) or public.is_platform_admin());

drop policy if exists "members add files" on public.document_files;
create policy "members add files" on public.document_files for insert
  with check (
    public.has_role(business_id, array['owner','manager','finance','junior_finance'])
    and uploaded_by = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and d.business_id = document_files.business_id)
  );

drop policy if exists "finance shares files" on public.document_files;
create policy "finance shares files" on public.document_files for update
  using (public.has_role(business_id, array['owner','manager','finance']))
  with check (public.has_role(business_id, array['owner','manager','finance']));

drop policy if exists "members remove files" on public.document_files;
create policy "members remove files" on public.document_files for delete
  using (public.has_role(business_id, array['owner','manager','finance'])
    or (uploaded_by = auth.uid() and public.is_member(business_id)));

grant select, insert, update, delete on public.document_files to authenticated;
grant all on public.document_files to service_role;
