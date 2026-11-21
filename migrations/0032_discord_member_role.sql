-- 재순이·사이트를 쓸 수 있는 디스코드 역할(intent/0004 R8~R11). 관리자가 /운영 사용역할로 정한다(행이 없으면 서버 멤버 모두 허용).
-- 기존 코드는 이 테이블을 읽지 않으므로 이전 버전과 호환된다.
create table discord_member_role (
  id int primary key default 1 check (id = 1),
  role_id text not null check (role_id ~ '^\d{17,20}$'),
  set_by text not null,
  updated_at timestamptz not null default now()
);
