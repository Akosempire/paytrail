-- Usetally: limits against bots and password guessing. Safe to run more than once.
-- A counter per key (a hash of an IP address or email, plus what's being
-- done) per time window. Only the server (service role) uses it.
create table if not exists public.rate_hits (
  key text not null,
  bucket timestamptz not null,
  hits integer not null default 0,
  primary key (key, bucket)
);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;
grant select, insert, update, delete on public.rate_hits to service_role;

-- counts one hit; true while the key is within max_hits for this window
create or replace function public.rate_hit(hit_key text, window_seconds integer, max_hits integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  b timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(window_seconds, 1)) * greatest(window_seconds, 1));
  n integer;
begin
  insert into public.rate_hits(key, bucket, hits) values (left(hit_key, 200), b, 1)
    on conflict (key, bucket) do update set hits = public.rate_hits.hits + 1
    returning hits into n;
  -- tidy up now and then
  if random() < 0.02 then delete from public.rate_hits where bucket < now() - interval '2 days'; end if;
  return n <= max_hits;
end; $$;
revoke all on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;
