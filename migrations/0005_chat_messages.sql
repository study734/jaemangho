-- 디스코드 채팅의 "메타데이터"만 저장한다: 누가, 언제, 반응이 몇 개. 글 내용은 읽지도 저장하지도 않는다
-- (봇에 메시지 내용 권한이 없어 내용은 빈 값으로 온다). 명예의 전당과 수다 통계에 쓴다.
create table if not exists chat_messages (
  id text primary key,                 -- 디스코드 메시지 ID
  channel_id text not null,
  author_id text not null,             -- 디스코드 사용자 ID (account."accountId"와 같다)
  author_name text not null,           -- 표시 이름(저장 시점)
  created_at timestamptz not null,
  reactions integer not null default 0, -- 모든 이모지 반응 수의 합
  top_emoji text,                       -- 가장 많이 달린 이모지
  updated_at timestamptz not null default now()
);
create index if not exists chat_messages_created_at on chat_messages (created_at desc);
create index if not exists chat_messages_reactions on chat_messages (reactions desc, created_at desc);
