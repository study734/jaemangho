# 웹에 들어오지 않는 멤버도 디스코드에서 재순이를 알고 바로 쓰기 — 명세·계획

상태: 승인 <!-- 2026-11-21 소유자가 대화에서 두 방향을 골랐다. 세부 설계는 그 범위 안의 구현 선택 -->
intent: [intent.md](intent.md)

## 요구사항
- R1. 이 서버의 멤버(Discord 서명·서버 ID 확인)가 사이트 계정 없이 `/의견`·`재순이에게 전달`·`/기록`·`/멤버`·`/전적`·`/패치노트`·`/모집`(참여·나가기·마감)·`출처 찾기`를 쓰면 시스템은 로그인 안내 없이 처리한다.
- R2. 사이트 계정이 없는 멤버가 `/게임추천`이나 게임추천 버튼·선택을 쓰면 시스템은 "Steam 연결에는 사이트 로그인이 필요하다"는 안내를 보내고 Steam을 조회하지 않는다.
- R3. 사이트에서 차단된 계정은 어떤 명령·버튼·의견 제출도 처리하지 않고 차단 안내를 보낸다.
- R4. 사이트 계정 없이 보낸 의견도 저장되고(같은 24시간 5건 제한), 관리자 `/개선`에는 이름 대신 디스코드 멘션으로 보인다.
- R5. 시상식 채널이 정해져 있고 봇 토큰이 있으면, 매일 운영 보조 점검 뒤 재순이는 아직 올리지 않은 공지 하나를 그 채널에 올린다: 사용법 안내(버전별 한 번), 그다음 아직 알리지 않은 디스코드 패치노트를 한 메시지로 묶어서.
- R6. 처음 켜질 때는 지금까지의 패치노트를 새 소식으로 다시 올리지 않는다(사용법 안내가 현재 기능을 설명한다).
- R7. 같은 공지는 한 번만 올린다. Discord가 거절(4xx·429)하면 다음 날 다시 시도한다. 응답 없이 끝나 올라갔는지 모르면(시간 초과·네트워크·5xx) 중복을 피하려고 다시 올리지 않고 실패로 남긴다. 실패는 `app_failures`의 `chat.announce`에 코드만 남는다.

## 인수 조건과 검증
| 요구사항 | 통과 기준 | 검증 방법 |
|---|---|---|
| R1·R2·R3 | 계정 없음 → 열거한 기능 처리, 게임추천은 안내·Steam 미조회, 차단 → 모두 차단 안내 | `handler.test.ts` |
| R3 접근 판정 | 계정 있음 → id, 없음 → 손님, 차단 → banned, 다른 provider는 손님 | `access.integration.test.ts` |
| R4 | 계정 없는 의견 저장·제한, `/개선`에 멘션 | `feedback.integration.test.ts`, `admin.test.ts` |
| R5·R6·R7 | 첫 실행: 안내만 올리고 기존 노트는 건너뜀 / 새 노트 묶음 한 번 / 4xx 재시도 / 시간 초과는 재게시 안 함 / 채널·토큰 없음은 아무것도 안 함 | `announce.integration.test.ts`, `announce.test.ts` |

## 설계
- `access.ts`: `commandAccess(discordId)` → `{ userId: string | null }`(손님은 null) 또는 `'banned'`. 기존 `commandUser`는 다른 멤버의 계정 조회(`/멤버`)에 그대로 쓴다.
- `handler.ts`: `processCommand`·`processFeedback`이 `commandAccess`를 쓴다. 게임추천 명령과 Steam 버튼·선택 앞에서만 `userId`를 요구한다.
- `feedback.ts` + `migrations/0030_feedback_guest.sql`: `member_feedback.user_id`를 null 허용(이전 코드는 항상 값을 넣으므로 호환). `/개선` 목록은 left join, 이름이 없으면 멘션.
- 새 `src/server/chat/announce.ts` + `migrations/0031_discord_announcements.sql`(`key`, `covers text[]`, `status`, `error_code`, `message_id`): 게시 대상 계산(순수 함수)과 게시. 채널은 시상식 채널(`awardChannel`), 토큰은 `DISCORD_BOT_TOKEN`. `posted`·`skipped`·`posting`·`unknown` 행의 `covers`를 이미 알린 것으로 본다. `failed`만 다시 선점한다.
- `/api/cron/ops-watchdog`: 주간 요약 뒤, Steam 수집 앞에서 `postAnnouncements()`. 실패는 응답을 바꾸지 않는다. 한 실행에 메시지 하나, 요청 시간 제한 5초.
- 사용법 문구는 `announce.ts`의 `GUIDE`와 `GUIDE_VERSION`. 문구를 고쳐 다시 알리려면 버전을 올린다.
- 환경변수·`vercel.json`·웹 화면 변경 없음.

## 우려 사항
- 사이트 계정이 없는 사람은 사이트에서 차단할 수 없다. 서버 멤버만 쓸 수 있으므로 디스코드 서버의 추방·차단이 그 역할을 한다.
- 시상식 채널이 정해져 있지 않으면 공지도 꺼진다(관리자 `/운영 시상식채널`). 운영 채널 설정 여부는 확인하지 않았다.
- 공지 효과(사용자 수 변화)는 `/개선`의 디스코드 사용량으로 1~2주 뒤 본다. 지금은 측정 전이다.

## 범위 밖
새 멤버 입장 환영 메시지(게이트웨이 연결이 필요), 공지 전용 채널 설정, 웹 화면 변경, 게임추천의 손님 지원.

## 계획
1. 실패 테스트 먼저: `handler.test.ts`(손님·차단), `access.integration.test.ts`, `feedback.integration.test.ts`, `announce.*`.
2. 마이그레이션 0030·0031 → `access.ts` → `handler.ts` → `feedback.ts`·`admin.ts` → `announce.ts` → watchdog 라우트.
3. README 디스코드 절·OPERATIONS 보조 점검 절, 패치노트 항목.
4. 증명: 관련 테스트(격리 DB) → lint·test·build·디스코드 E2E.
