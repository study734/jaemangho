-- 멤버 의견(디스코드 /의견, 메시지 우클릭 "재순이에게 전달"). intent/0002-member-feedback-channel.
-- id는 입력창 제출 interaction ID라 Discord 재전송이 와도 한 번만 저장된다. 원래 메시지 내용은 저장하지 않고 위치(링크)만 둔다.
-- 90일이 지나면 운영 점검의 보존 기간 정리가 지운다. 기존 코드는 이 테이블을 읽지 않으므로 이전 버전과 호환된다.
create table member_feedback (
  id text primary key check (id ~ '^\d{17,20}$'),
  user_id text not null references "user"(id) on delete cascade,
  discord_id text not null check (discord_id ~ '^\d{17,20}$'),
  body text not null check (length(body) between 1 and 1000),
  source text not null check (source in ('command', 'message')),
  message_link text check (message_link ~ '^https://discord\.com/channels/\d{17,20}/\d{17,20}/\d{17,20}$'),
  created_at timestamptz not null default now()
);
create index member_feedback_discord_created on member_feedback (discord_id, created_at);
create index member_feedback_created on member_feedback (created_at);
