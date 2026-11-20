-- 디스코드 기능 사용량(intent/0003-discord-usage-metrics). 사용자를 식별하는 장기 기록은 남기지 않는다.
-- discord_usage: 한국 시간 날짜·기능별 횟수, 하루 사용자 수, 처리 시간 합계·최대(365일 보관).
-- discord_usage_users: 하루 사용자 수를 세기 위한 임시 행. 매일 운영 점검이 전날보다 오래된 행을 지워 ID는 최대 약 이틀만 남는다.
-- 새 테이블만 추가하므로 이전 버전 코드와 호환된다.
create table discord_usage (
  day date not null,
  action text not null check (length(action) between 1 and 60),
  uses integer not null check (uses >= 0),
  users integer not null check (users >= 0),
  total_ms bigint not null check (total_ms >= 0),
  max_ms integer not null check (max_ms >= 0),
  primary key (day, action)
);
create table discord_usage_users (
  day date not null,
  action text not null,
  discord_id text not null check (discord_id ~ '^\d{17,20}$'),
  primary key (day, action, discord_id)
);
