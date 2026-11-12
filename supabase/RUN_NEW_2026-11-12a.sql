-- Founder dashboard: how many quotes, invoices and receipts Usetally has sent
-- out, this month, last month and all time. Sales that came in from a POS
-- (TrackOja) are counted on their own, so they don't inflate the invoices.
-- Same access as founder_summary: founders and platform admins.
-- Safe to run more than once.

create or replace function public.founder_sent_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m0 timestamptz := date_trunc('month', now());
  m1 timestamptz := date_trunc('month', now()) - interval '1 month';
begin
  if not (public.is_platform_admin() or public.is_platform_viewer()) then raise exception 'Not allowed'; end if;

  return jsonb_build_object(
    'quotes', (select jsonb_build_object(
        'month', count(*) filter (where d.sent_at >= m0),
        'last_month', count(*) filter (where d.sent_at >= m1 and d.sent_at < m0),
        'all', count(*))
      from public.documents d where d.kind = 'quote' and d.sent_at is not null and d.source <> 'pos'),
    'invoices', (select jsonb_build_object(
        'month', count(*) filter (where d.sent_at >= m0),
        'last_month', count(*) filter (where d.sent_at >= m1 and d.sent_at < m0),
        'all', count(*))
      from public.documents d where d.kind = 'invoice' and d.sent_at is not null and d.source <> 'pos'),
    'receipts', (select jsonb_build_object(
        'month', count(*) filter (where r.issued_at >= m0),
        'last_month', count(*) filter (where r.issued_at >= m1 and r.issued_at < m0),
        'all', count(*))
      from public.receipts r join public.documents d on d.id = r.document_id where d.source <> 'pos'),
    'pos_sales', (select jsonb_build_object(
        'month', count(*) filter (where d.created_at >= m0),
        'last_month', count(*) filter (where d.created_at >= m1 and d.created_at < m0),
        'all', count(*))
      from public.documents d where d.source = 'pos')
  );
end; $$;
revoke all on function public.founder_sent_counts() from public, anon;
grant execute on function public.founder_sent_counts() to authenticated;
