-- Private opt-in preferences and Jaemangho-only inference budgets. No chat text.
create table ai_preferences (
  user_id text primary key references "user"(id) on delete cascade,
  note text not null check (length(note) <= 400),
  updated_at timestamptz not null default now()
);
create table ai_requests (
  id uuid primary key,
  user_id text not null,
  started_at timestamptz not null default now(),
  active_until timestamptz
);
create index ai_requests_started on ai_requests(started_at);
create table ai_model_calls (
  request_id uuid not null,
  called_at timestamptz not null default now()
);
create index ai_model_calls_called on ai_model_calls(called_at);
create table ai_provider_pause (
  id integer primary key check (id = 1),
  until_at timestamptz not null
);
