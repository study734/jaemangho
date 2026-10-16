-- Explicit user input only. Raw Steam histories keep their existing short TTL.
create table steam_tastes (
  user_id text primary key references "user"(id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
