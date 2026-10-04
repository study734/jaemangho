-- 롤 소환사와 Steam 계정에 "주인"(디스코드 로그인 사용자)을 연결한다. 비어 있으면 주인 없음.
-- 기존 행은 누구 것인지 추측하지 않고 비워 둔다(나중에 사람이 지정). 사용자가 지워져도 계정 목록은 남는다.
alter table members add column if not exists owner_id text references "user" (id) on delete set null;
alter table steam_members add column if not exists owner_id text references "user" (id) on delete set null;
create index if not exists members_owner_id on members (owner_id);
create index if not exists steam_members_owner_id on steam_members (owner_id);
