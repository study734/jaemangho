-- 디스코드 포럼 스레드에 이미 올린 외부 일정. memo_key(외부 사이트의 일정 고유키)가 중복 게시를 막는다.
-- 기존 테이블과 독립적이다.
create table subgame_posts (
  memo_key text primary key check (length(memo_key) between 1 and 100),
  game text not null check (length(game) between 1 and 100),
  thread_id text not null check (thread_id ~ '^\d{17,20}$'),
  posted_at timestamptz not null default now()
);
