-- 사이트 계정 없이 디스코드에서 보낸 멤버 의견(intent/0004-discord-first-access-and-announcements).
-- user_id만 null을 허용한다. 이전 버전 코드는 항상 값을 넣고 inner join으로 읽으므로 그대로 동작한다(손님 의견만 목록에서 빠진다).
alter table member_feedback alter column user_id drop not null;
