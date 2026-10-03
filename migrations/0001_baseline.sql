-- 기준(baseline) 스키마. 운영 DB에는 이미 같은 테이블이 있으므로 모두 "없을 때만" 만든다.
-- 앞으로의 변경은 이 파일을 고치지 말고 0002_*.sql 처럼 새 파일을 추가한다.

-- ── 로그인(Better Auth): user / session / account / verification ─────────────
create table if not exists "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null,
  image text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp,
  -- admin 플러그인
  role text,
  banned boolean,
  "banReason" text,
  "banExpires" timestamptz,
  -- 앱 추가 필드 (server/auth.ts의 user.additionalFields)
  username text,
  "loginCount" integer,
  "lastLoginAt" timestamptz
);

create table if not exists session (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" (id) on delete cascade,
  "impersonatedBy" text
);

create table if not exists account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null
);

create table if not exists verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create index if not exists "session_userId_idx" on session ("userId");
create index if not exists "account_userId_idx" on account ("userId");
create index if not exists verification_identifier_idx on verification (identifier);

-- 이전 버전의 스키마(런타임 생성)에서 올라온 DB를 위해, 나중에 추가된 컬럼도 보장한다
alter table "user" add column if not exists role text;
alter table "user" add column if not exists banned boolean;
alter table "user" add column if not exists "banReason" text;
alter table "user" add column if not exists "banExpires" timestamptz;
alter table "user" add column if not exists username text;
alter table "user" add column if not exists "loginCount" integer;
alter table "user" add column if not exists "lastLoginAt" timestamptz;
alter table session add column if not exists "impersonatedBy" text;

-- ── 앱: 소환사 목록, Riot 캐시/통계/오류 ───────────────────────────────────
create table if not exists members (
  id text primary key,
  game_name text not null,
  tag_line text not null,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table members add column if not exists created_by_name text;
create unique index if not exists members_riot_id on members (lower(game_name), lower(tag_line));

create table if not exists riot_cache (
  key text primary key,
  status integer not null,
  body jsonb not null,
  expires_at timestamptz not null
);

create table if not exists riot_errors (
  at timestamptz not null default now(),
  status integer not null,
  path text not null
);

create table if not exists riot_stats (
  day date primary key,
  hits integer not null default 0,
  misses integer not null default 0
);
