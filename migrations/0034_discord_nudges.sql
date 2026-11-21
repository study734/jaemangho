-- 연결 안 된 친구 알림(intent/0005 R5)의 되풀이 제한: 같은 친구에게는 6시간에 한 번만 멘션 알림을 보낸다.
-- 디스코드 ID와 마지막 알림 시각만 두고, 알림을 보낼 때 하루가 지난 행을 지운다. 새 테이블만 추가하므로 이전 버전과 호환된다.
create table discord_nudges (
  discord_id text primary key check (discord_id ~ '^\d{17,20}$'),
  nudged_at timestamptz not null default now()
);
