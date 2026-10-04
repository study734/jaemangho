-- 화면별 하루 열람 횟수. 누가 열었는지(사용자, IP)는 저장하지 않고 개수만 센다.
create table if not exists page_views (
  day date not null,            -- 한국 시간 기준 날짜
  path text not null,           -- src/lib/track.ts의 화면 키(예: /steam, /people/[id])
  views integer not null default 0,
  primary key (day, path)
);
