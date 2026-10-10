-- 외부 스케줄러의 성공 기록은 수동/보조 점검과 구분한다.
alter table ops_monitor add column external_checked_at timestamptz;
-- 기존 버전의 checked_at 갱신이 새 검사 구간을 전진시키지 않게 분리한다.
-- 초기값은 NULL로 두어 첫 적용 시 보관된 오류 전체를 확인한다.
alter table ops_monitor add column errors_checked_at timestamptz;
