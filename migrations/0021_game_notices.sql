-- 멤버가 올리는 게임 일정(event)과 리딤코드(code). 기존 테이블과 독립적이다.
-- 만료(ends_at, 일정은 시작 1일 뒤)된 글은 조회에서 자동으로 빠진다. 삭제 작업은 따로 두지 않는다.
create table game_notices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('event', 'code')),
  game text not null check (length(game) between 1 and 40),
  title text not null check (length(title) between 1 and 100),
  code text check (code is null or length(code) between 1 and 80),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'code' or code is not null),
  check (kind <> 'event' or starts_at is not null),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index game_notices_ends_at on game_notices (ends_at);
