-- 기존 코드와 호환되는 운영용 테이블만 추가한다.
create table ops_audit (
  id bigserial primary key,
  actor_id text not null,
  actor_name text not null,
  action text not null,
  target text not null,
  result text not null check (result in ('started', 'success', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ops_audit_created on ops_audit (created_at desc);

create table ops_jobs (
  id text primary key,
  job text not null,
  source text not null check (source in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error_code text
);
create unique index ops_jobs_running on ops_jobs (job) where status = 'running';
create index ops_jobs_started on ops_jobs (started_at desc);

create table ops_alerts (
  key text primary key,
  title text not null,
  severity text not null check (severity in ('warning', 'critical')),
  active boolean not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz,
  notified_state boolean,
  notified_at timestamptz,
  notification_error text
);
create table ops_monitor (
  id integer primary key check (id = 1),
  checked_at timestamptz not null
);

create table steam_cache (
  key text primary key,
  body jsonb not null,
  expires_at timestamptz not null
);
create index steam_cache_expires on steam_cache (expires_at);
create table steam_stats (
  day date primary key,
  hits integer not null default 0,
  misses integer not null default 0,
  errors integer not null default 0
);
create table steam_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  endpoint text not null,
  code text not null
);
create index steam_errors_at on steam_errors (at desc);
