-- 서버 실패를 한국 시간 날짜·작업 이름·오류 분류별 횟수로만 센다(관리자 "개선 우선순위"가 사용).
-- operation은 코드에 고정된 작업 이름, code는 diagnostics.ts의 안전한 분류값이다. 사용자·요청·오류 원문은 저장하지 않는다.
-- 새 테이블만 추가하므로 이전 버전 코드와 호환된다.
create table if not exists app_failures (
  day date not null,
  operation text not null,
  code text not null,
  count integer not null default 0,
  primary key (day, operation, code)
);
