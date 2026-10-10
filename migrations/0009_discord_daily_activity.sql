-- 메시지별 메타데이터를 60일 뒤 지워도 날짜별 비식별 활동량은 남긴다.
-- 기존 단일 Discord 서버의 ⛵ 채널 범위만 집계한다. 사용자/채널 식별자는 보존하지 않는다.
create table discord_daily_activity (
  day date primary key,
  messages integer not null check (messages >= 0),
  replies integer not null check (replies >= 0),
  reactions bigint not null check (reactions >= 0),
  active_authors integer not null check (active_authors >= 0),
  updated_at timestamptz not null default now()
);
