-- 디스코드에서 막힌 시도를 이유별로 센다(역할 없음·차단·Steam 로그인 필요·Steam 동의 필요·친구 미연결).
-- discord_usage와 같은 규칙: 날짜·이유별 횟수와 하루 사용자 수만 영구 보관(365일), 사용자 수를 세는 임시 ID는
-- discord_usage_users에 action '막힘:<이유>'로 두고 매일 운영 점검이 지운다. 새 테이블만 추가하므로 이전 버전과 호환된다.
create table discord_usage_blocks (
  day date not null,
  reason text not null check (reason in ('no_role', 'banned', 'steam_login', 'steam_consent', 'friend_unlinked')),
  uses integer not null check (uses >= 0),
  users integer not null check (users >= 0),
  primary key (day, reason)
);
