-- 디스코드 /모집: 채널에 공개로 올린 "같이 할 사람 모집" 메시지 하나 = 행 하나. id는 /모집 interaction id다.
-- 참여·나가기·마감은 이 행을 원자적으로 바꾸고, version으로 늦게 도착한 메시지 수정이 최신 상태를 덮어쓰지 않게 한다.
-- 일주일 지난 행은 새 모집을 만들 때 지운다. 기존 코드는 이 테이블을 읽지 않으므로 이전 버전과 호환된다.
create table discord_lobbies (
  id text primary key check (id ~ '^\d{17,20}$'),
  owner_discord_id text not null check (owner_discord_id ~ '^\d{17,20}$'),
  game text check (length(game) between 1 and 100),
  play_time text check (length(play_time) between 1 and 60),
  max_members int check (max_members between 2 and 20),
  member_ids text[] not null check (cardinality(member_ids) between 1 and 20),
  closed boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index discord_lobbies_created_at on discord_lobbies (created_at);
