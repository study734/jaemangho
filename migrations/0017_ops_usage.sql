-- 이전 버전 앱과 호환되는 단일 사용량 스냅샷. 비밀값·연결 주소는 저장하지 않는다.
create table ops_usage (
  id integer primary key check (id = 1),
  checked_at timestamptz not null,
  sample jsonb,
  error_code text,
  mode text not null check (mode in ('normal', 'limited', 'paused'))
);
