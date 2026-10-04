-- 개념글 보관함, 주간 칭호, 그리고 이를 위한 채팅 메타데이터(답글 대상, 웃음 수). 글 내용은 어디에도 저장하지 않는다.
-- chat_messages는 60일만 보관하지만 chat_highlights와 chat_awards는 계속 남아 "보관함"과 "수집"이 된다.

alter table chat_messages add column if not exists reply_to text;                -- 이 메시지가 답한 메시지 ID(답글일 때)
alter table chat_messages add column if not exists laugh integer not null default 0; -- ㅋ/ㅎ 글자 수(웃음 분석을 켰을 때만 채워진다. 글 자체는 저장하지 않는다)
create index if not exists chat_messages_reply_to on chat_messages (reply_to) where reply_to is not null;

create table if not exists chat_highlights (
  id text primary key,                 -- 디스코드 메시지 ID
  channel_id text not null,
  author_id text not null,             -- 디스코드 사용자 ID
  author_name text not null,
  created_at timestamptz not null,
  reactions integer not null,          -- 지금까지 본 가장 큰 값(반응이 지워져도 개념글은 남는다)
  replies integer not null default 0,  -- 받은 답글 수(지금까지 본 가장 큰 값)
  top_emoji text,
  first_seen_at timestamptz not null default now()
);
create index if not exists chat_highlights_created_at on chat_highlights (created_at desc);

create table if not exists chat_awards (
  week_start date not null,            -- 한국 시간 기준 그 주의 월요일
  title text not null,                 -- src/lib/titles.ts의 키
  author_id text not null,
  author_name text not null,
  value integer not null,              -- 칭호의 근거 수치(메시지 수, 답글 수 등)
  primary key (week_start, title, author_id)
);
