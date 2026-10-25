-- Usetally: run once in Supabase → SQL Editor (2026-10-25, signatures + product tour)
-- Authorised signature on quotes, invoices and receipts.
-- The image lives in the public "logos" bucket next to the logo
-- (<business_id>/signature-<time>.png), like the logo itself.
alter table public.businesses
  add column if not exists signature_path text,
  add column if not exists signatory_name text,
  add column if not exists signatory_title text;

-- issued documents keep the signature they were sent with
create or replace function public.business_snapshot(b public.businesses) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'name', b.name, 'legal_name', b.legal_name, 'email', b.email, 'phone', b.phone, 'website', b.website,
    'address', b.address, 'city', b.city, 'country', b.country, 'tax_id', b.tax_id,
    'logo_path', b.logo_path, 'brand_color', b.brand_color, 'footer_note', b.footer_note,
    'bank_name', b.bank_name, 'bank_account_name', b.bank_account_name, 'bank_account_number', b.bank_account_number,
    'signature_path', b.signature_path, 'signatory_name', b.signatory_name, 'signatory_title', b.signatory_title,
    'frozen_at', now());
$$;

-- remembers that someone has finished (or skipped) the product tour
alter table public.profiles add column if not exists tour_done_at timestamptz;
