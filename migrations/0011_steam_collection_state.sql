-- 계정별 수집 진행 상태. 게임별 기준값만으로는 빈/비공개 계정의 마지막 조회 결과를 알 수 없다.
create table steam_collection_state (
  steam_id text primary key references steam_members (steam_id) on delete cascade,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_result text check (last_result in ('success', 'unavailable', 'error')),
  last_error_code text
);
create index steam_collection_state_success on steam_collection_state (last_success_at);
