# 멤버 의견 경로 — 명세·계획

상태: 완료 <!-- #146 머지로 구현. 명세: 2026-11-20 소유자 승인 -->
intent: [intent.md](intent.md)

새 테이블에 멤버가 쓴 글을 저장하는 데이터·개인정보 변경이라 계획까지 함께 확인받는다(AGENTS.md AI-native 개발 흐름).

## 요구사항
- R1. 멤버가 `/의견`을 실행하면 시스템은 "재순이에게 의견 보내기" 입력창(modal)을 띄운다. 입력칸은 하나(여러 줄, 1~1000자)다.
- R2. 멤버가 메시지 우클릭 → 앱 → **재순이에게 전달**을 고르면 시스템은 같은 입력창을 띄우고, 제출한 의견에 그 메시지의 위치(채널·메시지 ID 링크)만 함께 저장한다. **원래 메시지의 내용은 저장하지 않는다**(메시지 내용 미저장 원칙).
- R3. 입력창을 제출하면 시스템은 사이트에 디스코드로 로그인한 적이 있고 차단되지 않은 멤버(기존 `commandUser`)인 경우에만 저장하고, 본인에게만 "재순이가 전달받았어요"라고 답한다. 아니면 저장하지 않고 다른 명령과 같은 로그인 안내를 본인에게만 보낸다.
- R4. 한 사람이 최근 24시간 안에 5건을 넘게 보내면 시스템은 저장하지 않고 "잠시 뒤에 다시 보내 주세요"라고 답한다(도배·무료 DB 보호).
- R5. 같은 제출이 다시 와도(Discord 재전송) 의견은 한 번만 저장된다(interaction ID 기준).
- R6. 관리자가 `/개선`을 실행하면 시스템은 기존 개선 우선순위 아래에 최근 7일 의견 수와 최신 5건(작성자 멘션 없이 표시 이름, 날짜, 앞 200자, 메시지 링크)을 보여 준다. 관리자 판정은 기존 `adminUser` 그대로다.
- R7. 의견은 저장 후 90일이 지나면 매일 운영 점검의 보존 기간 정리에서 지워진다.
- R8. 저장·조회 실패는 본인에게 오류 ID와 함께 알리고 `app_failures`의 `api/discord.feedback`로 남긴다(개선 우선순위의 `api/discord` 영역 규칙에 맞춤). 의견 원문은 로그·오류 기록에 남기지 않는다.

## 인수 조건과 검증
| 요구사항 | 통과 기준 | 검증 방법 |
|---|---|---|
| R1·R2 | `/의견`·메시지 명령의 첫 응답이 입력창(type 9)이고 DB를 쓰지 않음, 메시지 명령은 custom_id에 채널·메시지 ID만 담음 | `src/server/discord-interactions/handler.test.ts` |
| R3·R5 | 가입·미차단만 저장, 같은 interaction 재전송은 1건, 미가입은 저장 없음 | `src/server/discord-interactions/feedback.integration.test.ts`(새 파일) |
| R4 | 24시간 5건 초과 거부, 24시간 지나면 다시 허용 | 같은 통합 테스트 |
| R6 | `/개선`에 최근 7일 수·최신 5건, 원문 200자 자름·마크다운 이스케이프, 멘션 없음 | `admin.test.ts` 갱신 |
| R7 | 90일 지난 의견 삭제 | 같은 통합 테스트(정리 함수 직접 호출) |
| R8 | 실패 시 오류 ID 안내, 원문이 로그에 없음 | `handler.test.ts` |
| 명령 등록 | `commands.json`에 `/의견`(slash)과 `재순이에게 전달`(message)이 있고 모든 정의가 서명 요청 스키마로 파싱됨, 등록 검사 통과 | `handler.test.ts`의 command definitions, `scripts/register-discord-command.test.ts`(명령 개수 고정값을 목록 기준으로 바꿈) |

## 설계
- 새 `src/server/discord-interactions/feedback.ts`: 입력창 정의(`feedbackModal(source, link?)`), 저장(`saveFeedback`), 조회(`recentFeedback`), 정리(`purgeOldFeedback`). SQL은 여기에만 둔다.
- `protocol.ts`: `/의견`(type 1)·`재순이에게 전달`(type 3) 명령과 입력창 제출(interaction type 5, custom_id `feedback:cmd` / `feedback:msg:<채널ID>:<메시지ID>`, 본문 1~1000자) 스키마 추가. `ackFor`에 `modal` 추가: 첫 응답 본문이 입력창이며 DB·외부 호출이 없다(3초 규칙 유지). 제출은 기존 비공개 지연 응답 → `after`에서 저장.
- `handler.ts`: 명령은 입력창으로 바로 응답, 제출은 `feedback.ts` 호출.
- `admin.ts`의 `/개선`: `recentFeedback` 결과를 덧붙인다.
- `src/server/operations/monitor.ts`의 보존 기간 정리에 `purgeOldFeedback` 한 줄 추가. 입력창 정의(`feedbackModal`)도 `feedback.ts`에 둔다.
- 마이그레이션 `migrations/0028_member_feedback.sql`: `member_feedback(id text pk = interaction id, user_id text not null, discord_id text not null, body text not null check (length(body) between 1 and 1000), source text check in ('command','message'), message_link text null, created_at timestamptz default now())`, `(discord_id, created_at)` 인덱스. 새 테이블만 추가해 이전 버전 코드와 호환.
- 패치노트(`area: 'discord'`)와 README 디스코드 명령 표 갱신. 새 명령은 배포 빌드에서 자동 등록된다.
- 무료 한도 영향: 의견 1건 ≈ 1~2KB, 하루 몇 건 수준. 요청은 사람이 보낼 때만 생겨 Neon을 주기적으로 깨우지 않는다. 환경변수·`vercel.json` 변경 없음.

## 우려 사항
- 사이트에 로그인한 적 없는 멤버는 입력창을 다 쓴 뒤 저장이 거절된다(R3). 입력창을 띄우기 전에 가입 여부를 확인하려면 첫 응답 전에 DB를 읽어야 해 3초 규칙과 충돌한다. → 거절 안내에 쓴 글을 그대로 돌려주어 다시 붙여 넣을 수 있게 한다.
- 관리자가 "처리 완료"를 표시하는 기능은 이번 범위 밖이다. 의견은 `/개선`에서 보고, 에이전트가 `intent/` 초안으로 옮기는 흐름(AGENTS.md 운영 단계)으로 다룬다.
- 의견을 GitHub 이슈로 보내는 기능은 토큰 환경변수가 필요해 범위 밖.

## 범위 밖
디스코드 Activity 앱, 웹 화면, 처리 상태 관리, GitHub 이슈 연동, 익명 의견.

## 계획
1. 실패 테스트 먼저: 프로토콜·ack(handler.test), 저장·중복·한도·정리(feedback.integration.test), `/개선` 표시(admin.test).
2. 마이그레이션 0028 → `feedback.ts` → `protocol.ts`·`handler.ts` → `admin.ts` → `monitor.ts` 정리.
3. `commands.json`·패치노트·README.
4. 증명: 관련 테스트(격리 DB) → `npm run lint`·`npm test`·`npm run build`·`npm run test:e2e`(디스코드 E2E 확인).
