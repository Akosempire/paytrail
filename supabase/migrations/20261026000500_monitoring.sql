-- Usetally: monitoring. The last result of each health check (so you're told
-- only when something changes), real failures users hit, and where alerts go.
-- Only the server (service role) reads or writes these. Safe to run more than once.
create table if not exists public.monitor_state (
  check_key text primary key,
  status text not null check (status in ('ok', 'warn', 'down')),
  detail text not null default '',
  changed_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  alerted_at timestamptz
);
create table if not exists public.monitor_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists monitor_events_recent_idx on public.monitor_events(kind, created_at desc);
alter table public.monitor_state enable row level security;
alter table public.monitor_events enable row level security;
grant all on public.monitor_state, public.monitor_events to service_role;

-- Telegram / Slack / Discord webhook for alerts (stored encrypted)
alter table public.platform_settings add column if not exists alert_webhook_enc text;
alter table public.platform_settings add column if not exists alert_webhook_hint text not null default '';
