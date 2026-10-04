-- 개념글 보관함과 주간 칭호. 둘 다 글 내용 없이 링크에 필요한 값과 집계만 저장한다.
-- chat_messages는 60일만 보관하지만, 이 둘은 계속 남겨 "보관함"과 "수집"이 된다.
create table if not exists chat_highlights (
  id text primary key,                 -- 디스코드 메시지 ID
  channel_id text not null,
  author_id text not null,             -- 디스코드 사용자 ID
  author_name text not null,
  created_at timestamptz not null,
  reactions integer not null,          -- 지금까지 본 가장 큰 값(반응이 지워져도 개념글은 남는다)
  top_emoji text,
  first_seen_at timestamptz not null default now()
);
create index if not exists chat_highlights_created_at on chat_highlights (created_at desc);

create table if not exists chat_awards (
  week_start date not null,            -- 한국 시간 기준 그 주의 월요일
  title text not null,                 -- src/lib/titles.ts의 키
  author_id text not null,
  author_name text not null,
  value integer not null,              -- 칭호의 근거 수치(메시지 수, 반응 수 등)
  primary key (week_start, title, author_id)
);
