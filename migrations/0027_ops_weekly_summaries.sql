-- 주간 운영 요약(src/server/operations/weekly-summary.ts)의 주별 처리 기록. 같은 주를 두 번 보내지 않게 하는 선점 행이다.
-- week는 한국 시간 월요일 날짜, status는 sent·quiet(보낼 내용 없음)·disabled·invalid_configuration·pending.
-- 새 테이블만 추가하므로 이전 버전 코드와 호환된다.
create table if not exists ops_weekly_summaries (
  week date primary key,
  status text not null default 'pending',
  updated_at timestamptz not null default now()
);
