# 디스코드 게임추천의 Steam 연결을 최대한 줄이기 — 명세·계획

상태: 승인 <!-- 2026-11-21 소유자 "최대 최적화로". 세부는 그 범위의 구현 선택 -->
intent: [intent.md](intent.md)

## 요구사항
- R1. 사이트 계정 없이 게임추천을 쓰면 안내에 `Steam 연결하기` 링크 버튼(`/connect/steam`)을 붙인다.
- R2. `/connect/steam`은 한 화면에 ①디스코드 로그인 ②Steam 연결 ③이용 동의 ④디스코드로 돌아가기를 순서대로 보이고, 끝난 단계는 완료로 표시한다. 로그인하지 않았으면 그 화면에서 로그인하고 다시 이 화면으로 돌아온다. 차단이면 로그인 화면의 차단 안내로 보낸다.
- R3. Steam 연결은 디스코드 프로필의 Steam 연결(로그인 때 자동)이나 Steam 본인 확인(OpenID)으로 하며, 본인 확인을 마치면 `/connect/steam`으로 돌아온다. 로그인 직후 자동 연결이 늦으면 화면이 한 번 다시 확인한다.
- R4. 사이트 계정은 있고 동의만 없으면 디스코드에서 웹과 같은 고지와 `동의하고 시작` 버튼을 보이고, 누르면 동의를 저장하고 확인된 내 계정의 첫 기록을 준비(최대 10초, 실패해도 계속)한 뒤 바로 친구 선택창을 연다. 저장 국가가 정해지지 않았으면 동의를 저장하지 않고 웹 링크로 안내한다.
- R5. 고른 친구 중 Steam이 연결되지 않은 사람이 있으면 그 안내에 `연결 안 된 친구에게 알리기` 버튼을 붙인다. 누르면 그 친구들만 멘션 알림을 받는 공개 메시지와 `Steam 연결하기` 링크 버튼을 채널에 올린다. 같은 친구에게는 6시간에 한 번만 알리고, 남은 친구가 없으면 요청자에게만 알린다.
- R6. 새 버튼은 사용량(`게임추천 › 이용 동의`, `게임추천 › 친구에게 알리기`)으로 센다.

## 인수 조건과 검증
| 요구사항 | 통과 기준 | 검증 방법 |
|---|---|---|
| R1·R4·R5·R6 | 링크 버튼, 동의 저장 후 선택창·저장 국가 없음, 알림 공개 메시지의 멘션 대상, 사용량 이름 | `handler.test.ts`, `usage.test.ts` |
| R5 제한 | 6시간 안 재알림 제외, 동시 클릭 한 번, 하루 지난 기록 삭제 | `nudge.integration.test.ts` |
| R2·R3 | 상태 계산(계정·동의), 본인 확인 후 돌아오는 주소 | `src/server/steam/setup.integration.test.ts`, `src/app/api/steam/activity/*.test.ts` |
| R2 화면 | 로그인 전·연결 전·동의 전·완료 상태, 모바일·PC | `e2e/connect-steam.spec.ts` + 실제 화면 캡처 |

## 설계
- 고지 문구: `src/lib/steam-notice.ts` 한 곳(웹 `ConsentGate`·연결 화면·디스코드가 같이 씀).
- 서버: `src/server/steam/setup.ts`의 `steamSetupStatus(userId)` → `{ accounts, consented, storageCountry }`.
- 웹: `src/app/connect/steam/page.tsx`(앱 틀 밖, 로그인 화면과 같은 로비 카드) + `src/features/steam/ConnectSteam.tsx`. 동의는 기존 `POST /api/steam/consent`. 본인 확인은 기존 `/api/steam/activity/start?from=connect`, 콜백이 `from=connect`면 `/connect/steam`으로 돌려보낸다(그 외 값은 무시).
- 로그인 버튼: `callbackURL`을 받을 수 있게 한다(같은 사이트 경로만, 기본 `/`). 로그인 판정은 그대로.
- 디스코드: `steamconsent:accept`(동의), `nudge:<id.id…>`(알림, 100자 안에 들어가는 만큼) 버튼. 알림은 첫 응답 공개, `allowed_mentions.users`를 그 친구들로 제한.

## 우려 사항
- 공개 알림은 채널에 멘션 알림을 보낸다. 요청자가 버튼을 누를 때만 보내고 요청자 본인은 멘션하지 않는다.
- 고지 문구의 예약 수집 문장(열린 질문 1)은 이번에 고치지 않는다.

## 범위 밖
Steam 주소 직접 입력, 동의 없이 추천 허용, 웹 로그인 없는 Steam 연결, 고지 문구 수정.

## 계획
1. 실패 테스트 → 고지 문구 추출 → 서버 상태·OpenID 돌아오기 → 디스코드 버튼 → 웹 화면 → 문서·패치노트.
2. 증명: 관련 테스트(격리 DB) → lint·test·build·E2E → 화면 캡처(PC·1024·모바일).
