# Steam 활동 정기 수집 — 명세·계획

상태: 완료 <!-- #145 머지로 구현. 명세: 2026-11-20 소유자 승인 -->
intent: [intent.md](intent.md)

변경이 한 서비스와 한 라우트에 그쳐 명세와 계획을 한 파일로 둔다(AGENTS.md AI-native 개발 흐름).

## 요구사항
- R1. 매일 운영 보조 점검(`/api/cron/ops-watchdog`, UTC 03시)이 끝나면 시스템은 Steam 예약 수집(`runSteamCollection('scheduled')`)을 한 번 실행한다. 대상·간격 규칙은 지금과 같다(본인 확인·요청·현재 동의·고지 버전, 마지막 성공 7일 경과, 15분 내 재시도 없음, 실행당 최대 20계정).
- R2. 무료 사용량이 `paused`면 시스템은 예약 수집을 하지 않는다. `limited`면 이틀에 한 번(마지막 예약 수집 시작 뒤 36시간 이상 — 하루 한 번 실행의 시작 시각이 흔들려도 사흘로 밀리지 않게, 2026-11-20 검토에서 수정)만 한다(채팅 수집과 같은 `scheduledCollectionAllowed`). 사용량을 확인할 수 없으면 `limited`로 본다(기존 `usageMode`).
- R3. 예약 수집은 새 Cron이나 별도 호출을 만들지 않는다. 이미 DB를 쓴 점검 요청 안에서만 실행해 Neon을 새로 깨우지 않는다.
- R4. 예약 수집의 시간 예산은 25초로, 점검·주간 요약과 합쳐 함수 최대 시간(60초) 안에 끝난다. 예산 안에 못 한 계정은 `deferred`로 남고 다음 날 이어서 한다.
- R5. 예약 수집이 막히거나(`budget`), 다른 수집이 실행 중이거나(`busy`), 실패해도 점검 응답과 주간 요약은 바뀌지 않는다. 실패는 `app_failures`의 `steam.activity.scheduled`로 남고, 응답에는 결과 상태와 개수만 담는다.
- R6. 실행 결과(대상·수집·조회 불가·실패·이월 수)는 지금처럼 `ops_jobs`의 `steam_activity` 작업에 `source = 'scheduled'`로 남는다.

## 인수 조건과 검증
| 요구사항 | 통과 기준 | 검증 방법 |
|---|---|---|
| R1·R6 | 예약 실행이 기존 대상 규칙대로 수집하고 `source='scheduled'`로 기록 | `src/server/activity/steam-collection.integration.test.ts` |
| R2 | `paused`면 수집하지 않음, `limited`면 다음 날(25시간) 거부·이틀째(48시간 조금 전) 허용, 수동 수집은 영향 없음 | 같은 통합 테스트(사용량 상태를 테스트 DB에 기록) |
| R3·R5 | 점검 뒤에만 호출, 수집 실패·거부가 점검 응답 상태를 바꾸지 않음, 외부 점검 경로는 수집하지 않음 | `src/app/api/cron/ops/route.test.ts`(두 점검 라우트를 함께 검사하는 기존 파일, 의존성 모의) |
| R4 | 예약 호출이 `budgetMs: 25_000`을 넘김 | 같은 라우트 테스트 |
| 무료 인프라 | 활성화 뒤 2주간 `ops_jobs` 수집·이월 수, 점검 소요 시간, 주간 요약의 Neon 연산·전송 사용률 | 운영 관찰(측정 전에는 효과를 단정하지 않음) |

## 설계
- `src/server/activity/steam-collection.ts`: `source === 'scheduled'`일 때 실행 자리를 잡는 같은 트랜잭션에서 `usageStatus()`와 마지막 예약 실행 시각을 읽어 `scheduledCollectionAllowed`로 판단하고, 거부면 `SteamCollectionBudgetError`를 던진다(채팅 `runChatSync`와 같은 모양).
- `src/app/api/cron/ops-watchdog/route.ts`: `checkOperations` → 주간 요약 → `runSteamCollection('scheduled', { budgetMs: 25_000 })`. 수집 오류는 `budget`/`busy`는 상태로, 그 밖은 `reportFailure` 후 `failed`로 바꿔 응답에 `steamActivity`로 붙인다.
- 무료 한도 영향(추정): Steam Web API 호출은 하루 최대 20회(일 한도 대비 매우 작음). Vercel 호출 수는 그대로이고 실행 시간만 최대 25초 늘어난다. Neon은 이미 깨어 있는 시간에 계정당 몇 번의 쿼리를 더한다. 마이그레이션·환경변수·`vercel.json` 변경 없음.

## 우려 사항
- `ops-watchdog`는 Hobby에서 실행 시각이 늦어질 수 있고, 하루 한 번이라 이월이 생기면 다음 날로 밀린다. 대상이 하루 20계정을 넘으면 7일 간격을 못 지킬 수 있다 → 측정 후 판단.
- 점검 자체가 오래 걸리는 날은 수집이 짧게 끝나며(예산 계산은 수집 시작 기준) 60초 초과 위험이 남는다 → 라우트에서 남은 시간이 부족하면 건너뛰는 것은 이번 범위 밖, 측정 후 판단.

## 범위 밖
수집 간격·계정 수 변경, 장기 기록 화면, 새 Cron.

## 계획
1. 실패 테스트 먼저: `scheduled` 거부(`paused`·`limited` 48시간) 통합 테스트, `ops-watchdog` 라우트 테스트(기존 `src/app/api/cron/ops/route.test.ts`에 추가).
2. `steam-collection.ts`에 예산 판단과 오류 타입 추가.
3. `ops-watchdog` 라우트에 호출 추가.
4. `OPERATIONS.md`의 보조 점검·Steam 장기 활동 수집 절을 실제 동작으로 갱신하고 `steam-collection.ts`의 "No cron" 주석을 고친다(README에는 수집 일정 설명이 없어 바꾸지 않음).
5. 증명: 관련 테스트 → `npm run lint`·`npm test`·`npm run build`.
