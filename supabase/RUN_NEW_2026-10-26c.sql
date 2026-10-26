-- Usetally: the team gets one email a day listing transfers waiting to be
-- confirmed, not one per customer. This marks which claims were included.
-- Safe to run more than once.
alter table public.payment_claims add column if not exists digest_sent_at timestamptz;
create index if not exists payment_claims_digest_idx on public.payment_claims(created_at) where status = 'pending' and digest_sent_at is null;
