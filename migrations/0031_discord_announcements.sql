-- 재순이 자동 공지(intent/0004-discord-first-access-and-announcements): 사용법 안내와 디스코드 패치노트를 시상식 채널에 한 번씩 올린다.
-- key: 메시지 하나(guide:v<버전>, notes:<가장 새 노트>, baseline). covers: 그 메시지가 알린 항목(안내 키·노트 키).
-- failed만 다시 시도한다. posting·unknown(올라갔는지 모름)·posted·skipped는 이미 알린 것으로 보고 다시 올리지 않는다.
-- 새 테이블만 추가하므로 이전 버전 코드와 호환된다.
create table discord_announcements (
  key text primary key check (length(key) between 1 and 300),
  covers text[] not null,
  status text not null check (status in ('posting', 'posted', 'failed', 'unknown', 'skipped')),
  channel_id text check (channel_id ~ '^\d{17,20}$'),
  message_id text check (message_id ~ '^\d{17,20}$'),
  error_code text check (error_code ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
