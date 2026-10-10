-- Riot·Steam 장기 관측 사실의 저장 구조. 수집 작업은 별도 활성화한다.
-- 계정이 목록에서 제거되면 해당 계정의 식별 가능한 관측 기록도 삭제한다.

create table riot_account_identity (
  member_id text primary key references members (id) on delete cascade,
  puuid text not null unique,
  verified_at timestamptz not null
);

create table riot_matches (
  match_id text primary key,
  played_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  queue_id integer,
  game_mode text not null,
  observed_at timestamptz not null
);
create index riot_matches_played_at on riot_matches (played_at desc);

create table riot_match_participants (
  match_id text not null references riot_matches (match_id) on delete cascade,
  member_id text not null references members (id) on delete cascade,
  puuid text not null,
  team_id integer not null,
  champion_id integer not null,
  win boolean not null,
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  assists integer not null check (assists >= 0),
  primary key (match_id, member_id),
  unique (match_id, puuid)
);
create index riot_match_participants_member on riot_match_participants (member_id, match_id);

create table steam_collection_requests (
  steam_id text primary key references steam_members (steam_id) on delete cascade,
  requested_by text not null references "user" (id) on delete cascade,
  notice_version text not null,
  requested_at timestamptz not null,
  stopped_at timestamptz
);

create table steam_game_totals (
  steam_id text not null references steam_members (steam_id) on delete cascade,
  app_id integer not null check (app_id > 0),
  minutes bigint not null check (minutes >= 0),
  observed_at timestamptz not null,
  primary key (steam_id, app_id)
);

create table steam_playtime_changes (
  steam_id text not null references steam_members (steam_id) on delete cascade,
  app_id integer not null check (app_id > 0),
  previous_observed_at timestamptz not null,
  observed_at timestamptz not null,
  previous_minutes bigint not null check (previous_minutes >= 0),
  minutes bigint not null check (minutes >= previous_minutes),
  primary key (steam_id, app_id, observed_at),
  check (observed_at > previous_observed_at)
);
create index steam_playtime_changes_observed on steam_playtime_changes (observed_at desc);
