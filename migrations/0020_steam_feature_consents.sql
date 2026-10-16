create table steam_feature_consents (
  user_id text primary key references "user"(id) on delete cascade,
  notice_version text not null,
  storage_country text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);
