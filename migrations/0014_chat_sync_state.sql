-- 채널별 수집 진행을 보존해 중단된 페이지부터 이어 받는다.
create table chat_sync_state (
  channel_id text primary key,
  completed_at timestamptz,
  started_at timestamptz,
  cutoff_at timestamptz,
  before_id text,
  updated_at timestamptz not null default now()
);
