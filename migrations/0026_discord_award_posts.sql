-- 주간 시상식 자동 게시. 관리자가 /운영 시상식채널로 채널을 정해야 켜진다(행이 없으면 꺼짐).
-- discord_award_posts는 주마다 한 번만 올리도록 먼저 'posting'으로 자리를 잡고, 성공·실패를 남긴다(실패는 다음 동기화가 다시 시도).
-- 기존 코드는 두 테이블을 읽지 않으므로 이전 버전과 호환된다.
create table discord_award_channel (
  id int primary key default 1 check (id = 1),
  channel_id text not null check (channel_id ~ '^\d{17,20}$'),
  set_by text not null,
  updated_at timestamptz not null default now()
);
create table discord_award_posts (
  week_start date primary key,
  channel_id text not null check (channel_id ~ '^\d{17,20}$'),
  status text not null check (status in ('posting', 'posted', 'failed')),
  message_id text,
  error_code text check (length(error_code) <= 40),
  updated_at timestamptz not null default now()
);
