-- AI assistants (ChatGPT, Claude, Grok) connect to Usetally over MCP.
-- The person signs in to Usetally, picks a business and what the assistant may
-- do; the assistant then gets an access token for that business only.
-- Everything here is used by the server (service role) only.

-- 1 -- apps that have registered (DCR) or identified themselves with a URL (CIMD)
create table if not exists public.oauth_clients (
  id text primary key,                          -- client_id
  kind text not null check (kind in ('dcr', 'cimd')),
  name text not null default '' check (char_length(name) <= 120),
  redirect_uris text[] not null default '{}',
  created_at timestamptz not null default now(),
  fetched_at timestamptz                        -- CIMD: when its metadata was last read
);

-- 2 -- a person's connection of one app to one business (what Settings lists)
create table if not exists public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.oauth_clients(id) on delete cascade,
  app_name text not null default '' check (char_length(app_name) <= 120),
  app_host text not null default '' check (char_length(app_host) <= 200),
  scope text not null check (scope in ('read', 'read write')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ai_connections_business_idx on public.ai_connections(business_id, created_at desc);

-- 3 -- one-time sign-in codes (10 minutes) and tokens; only hashes are stored
create table if not exists public.oauth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  scope text not null check (scope in ('read', 'read write')),
  redirect_uri text not null,
  code_challenge text not null,
  resource text not null default '',
  app_name text not null default '',
  app_host text not null default '',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.oauth_tokens (
  token_hash text primary key,
  connection_id uuid not null references public.ai_connections(id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  expires_at timestamptz not null,
  used_at timestamptz,                          -- refresh tokens are single use (rotated)
  created_at timestamptz not null default now()
);
create index if not exists oauth_tokens_connection_idx on public.oauth_tokens(connection_id);

alter table public.oauth_clients enable row level security;
alter table public.ai_connections enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
revoke all on public.oauth_clients, public.ai_connections, public.oauth_codes, public.oauth_tokens from anon, authenticated;
grant all on public.oauth_clients, public.ai_connections, public.oauth_codes, public.oauth_tokens to service_role;

-- 4 -- run one of the app's own actions as the person who connected the
-- assistant, so every rule the app has (roles, approvals, plan limits) applies
-- exactly as if they had clicked the button. Only these actions, only for the
-- server, and only functions that check permissions themselves.
create or replace function public.mcp_as_user(uid uuid, fn text, args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  allowed constant text[] := array['save_document', 'set_document_currency', 'submit_document', 'mark_document_sent',
    'queue_document_send', 'convert_quote_to_invoice', 'record_manual_payment', 'void_document', 'business_allowance'];
  f record;
  parts text[] := '{}';
  i integer;
  aname text;
  atype text;
  call text;
  result jsonb;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not (fn = any(allowed)) then raise exception 'That action is not available to assistants'; end if;
  select p.oid, p.proargnames, coalesce(string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[], '{}') as types, p.prosecdef, p.prorettype, p.pronargs
    into f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn
    order by p.pronargs desc limit 1;
  if f.oid is null then raise exception 'That action needs a database update'; end if;
  if not f.prosecdef then raise exception 'That action is not available to assistants'; end if;
  for i in 1 .. f.pronargs loop
    aname := f.proargnames[i];
    if args ? aname then
      atype := format_type(f.types[i], null);
      parts := parts || case
        when atype in ('jsonb', 'json') then format('%I => ($1 -> %L)::%s', aname, aname, atype)
        when atype like '%[]' then format('%I => (select coalesce(array_agg(x), ''{}'') from jsonb_array_elements_text($1 -> %L) x)::%s', aname, aname, atype)
        else format('%I => ($1 ->> %L)::%s', aname, aname, atype) end;
    end if;
  end loop;
  call := format('public.%I(%s)', fn, array_to_string(parts, ', '));

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
  begin
    if f.prorettype = 'void'::regtype then
      execute 'select ' || call using args;
      result := null;
    else
      execute 'select to_jsonb(' || call || ')' into result using args;
    end if;
  exception when others then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', '', true);
    perform set_config('request.jwt.claims', '', true);
    raise;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
  return result;
end; $$;

revoke all on function public.mcp_as_user(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_as_user(uuid, text, jsonb) to service_role;
