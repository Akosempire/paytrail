-- Usetally: monthly VAT returns. Each month moves to_file → requested (the
-- business asked Usetally to file it) → filed (with the amount and payment
-- reference) → done (paid, with the receipt kept). Filing can be done by the
-- business itself or by a tax consultant Usetally works with.
-- The business's team can read its own returns; every change goes through
-- the server. Safe to run more than once.
create table if not exists public.tax_consultants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  firm text not null default '',
  email text not null check (position('@' in email) > 1),
  phone text not null default '',
  citn_number text not null default '',
  active boolean not null default true,
  -- the consultant's private page: /consultant/<access_token>
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.vat_returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  currency text not null default 'NGN',
  vat_minor bigint not null default 0,
  sales_minor bigint not null default 0,
  status text not null default 'to_file' check (status in ('to_file', 'requested', 'filed', 'done')),
  mode text not null default 'self' check (mode in ('self', 'assisted')),
  consultant_id uuid references public.tax_consultants(id) on delete set null,
  requested_at timestamptz,
  requested_by_name text not null default '',
  request_note text not null default '' check (char_length(request_note) <= 1000),
  filed_at timestamptz,
  filed_by_name text not null default '',
  filing_reference text not null default '',
  amount_due_minor bigint,
  payment_reference text not null default '',
  done_at timestamptz,
  note text not null default '' check (char_length(note) <= 1000),
  reminded_7_at timestamptz,
  reminded_2_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, period)
);
create index if not exists vat_returns_queue_idx on public.vat_returns(status, requested_at) where mode = 'assisted';
create index if not exists vat_returns_consultant_idx on public.vat_returns(consultant_id, status);

create table if not exists public.vat_return_files (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.vat_returns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('acknowledgement', 'payment_receipt', 'other')),
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 4194304),
  storage_key text not null unique,
  uploaded_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists vat_return_files_return_idx on public.vat_return_files(return_id);

alter table public.tax_consultants enable row level security;
alter table public.vat_returns enable row level security;
alter table public.vat_return_files enable row level security;
drop policy if exists "members read their vat returns" on public.vat_returns;
create policy "members read their vat returns" on public.vat_returns for select using (public.is_member(business_id));
drop policy if exists "members read their vat return files" on public.vat_return_files;
create policy "members read their vat return files" on public.vat_return_files for select using (public.is_member(business_id));
grant select on public.vat_returns, public.vat_return_files to authenticated;
grant all on public.tax_consultants, public.vat_returns, public.vat_return_files to service_role;

-- shown to businesses on the "File & pay for me" button; 0 = free while testing
alter table public.platform_settings add column if not exists tax_filing_fee_minor bigint not null default 0;
