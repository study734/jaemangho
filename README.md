# ⚓ 재망호 (Jaemangho)

친구들과 게임을 고르고, 흥미로운 순간을 발견하고, 함께한 기록을 돌아보는 크루 전용 게임 커뮤니티입니다. UI는 친구들의 서브컬처 아지트를 위한 재망호 다크 디자인([DESIGN.md](DESIGN.md))을 따릅니다.

개발은 코딩 에이전트만 수행합니다. 설계·구현·문서·도구·검증은 이 전제를 따르며, 구체적인 작업 기준은 [AGENTS.md](AGENTS.md)에 둡니다.

## 기능
홈과 Steam·롤·기록 채널의 제공 기능은 재순이의 메시지와 임베드로 표시하며, 기존 입력·조회·검색·결과 동작을 그대로 사용할 수 있습니다.
- **오늘의 발견** (`/`): 완료된 주의 칭호·반응과 답글이 모인 개념글·평소보다 뚜렷하게 활발했던 대화 구간에서 최대 4개를 선별합니다. 칭호와 실제 인물·아바타·기록을 중심으로 결과를 공개하고, 반응을 저장·취소하거나 친구에게 공유할 수 있습니다. 같은 원문은 한 번만, 종류는 번갈아 보여주며 Steam 게임 뽑기 제안에서 목록이 끝납니다. 선별 기준을 통과한 기록이 없으면 사건을 꾸미지 않습니다. 출처별 성공 응답은 60초 캐시하고 같은 요청의 조회를 공유하며 구역별로 로딩합니다.
- **같이 놀기** (`/play`), **우리 기록** (`/memories`): 기존 Steam·LoL·개념글·시상식·멤버 프로필로 연결하는 허브입니다. PC는 재망호 서버 하나 안에서 카테고리와 채널을 탐색하고, 홈 오른쪽에는 멤버 활동 패널을 표시합니다. 모바일은 하단 네 탭을 사용하며 게임별 상세 메뉴와 기존 주소를 유지합니다.
- **대시보드** (`/lol`): 등록된 소환사별 티어/LP/승률, 최근 전적, 실시간 게임(관전) 상태
- **디스코드 서버 위젯** (`/`): 홈 오른쪽 멤버 활동 패널 맨 위에 서버 `742002842453409792`의 공식 다크 위젯을 표시합니다. 1024px 이하에서는 본문 뒤의 활동 영역으로 이어집니다. 기본 크기는 350×500px이며 패널·화면 너비에 맞게 줄입니다. 서버 HTML에는 같은 높이의 자리를 확보하고 hydration 이후 iframe을 생성해 HTML 필터의 iframe 제거로 생기는 React 불일치를 방지합니다. 화면에 가까워질 때 로드하고 `no-referrer`로 사이트 출처를 보내지 않으며, 사이트 집계와 별도로 Discord에서 내용을 제공합니다. 서버 설정의 위젯이 활성화되어 있어야 하며, 표시되지 않으면 아래 서버 링크로 이동할 수 있습니다.
- **소환사 관리** (`/lol/squad`): 보고 싶은 소환사를 검색해 목록에 추가, 수정, 삭제 (로그인한 모두가 함께 보는 공용 목록)
- **듀오 시너지 분석** (`/lol/synergy`), **챔피언 숙련도** (`/lol/mastery`), **설정** (`/lol/settings`, Riot 연결 확인)
- **Steam 게임 추천** (`/steam`): 2~20명을 선택하고 **모두 보유 / 일부 보유 포함 / 아무도 미보유** 중 추천 범위를 고릅니다. 기본은 모두 보유입니다. 보유 게임은 경험이 비슷한 게임·익숙한 게임·새로 해 볼 게임 기준으로 정렬하며, 일부 보유를 포함하면 보유자의 경험과 선택한 멤버의 보유 비율을 반영하고 보유 목록에 없는 멤버를 표시합니다. 전원 미보유 후보는 Steam 공개 스토어의 인기·신규 출시 목록(`featuredcategories`)에서 가져와 전원의 보유 목록에 없는 게임만 목록 순서대로 추천합니다(전체 카탈로그 검색이나 개인화 추천이 아니며 경험 점수는 표시하지 않음). 무료 게임은 보유 목록에 없어도 플레이할 수 있습니다. 각 범위의 상위 40개 후보에서 멀티플레이·협동 지원을 확인해 최대 12개를 추천하며, 같은 화면 전용 게임과 지원 미확인 게임은 제외합니다. 한 명이라도 보유 목록을 확인할 수 없으면 모든 범위에서 추천을 보류합니다. 최대 인원은 스토어에서 직접 확인합니다. 새 환경변수나 DB 마이그레이션은 없고 기존 Steam 캐시에 스토어 지원 정보는 24시간, 인기·신규 목록은 15분 저장합니다(오류는 캐시하지 않음).
- **관리자** (`/admin`): 아래 참고

## 기술 구성
Next.js(App Router) + React 19 + TypeScript(strict), 로그인은 [Better Auth](https://better-auth.com)(디스코드), DB는 Postgres(Neon, `pg`), Vercel 배포.

```
브라우저 ──(디스코드 로그인 쿠키)──> Next.js (Vercel)
   src/app/(app)/*  화면 (서버 컴포넌트에서 로그인/차단 확인 후 렌더)
   src/app/api/*    라우트 핸들러
        ├─ auth/*      Better Auth (디스코드 로그인, 서버 멤버만 허용, DB 세션)
        ├─ riot        Riot API 프록시 (허용 엔드포인트만, 키는 서버에서만 사용, DB 캐시)
        ├─ members     등록 소환사 목록 CRUD
        ├─ steam       Steam 멤버 목록, 공통 게임·사 놓고 안 한 게임 (키는 서버에서만 사용)
        ├─ /people     멤버 목록·프로필 (디스코드 사용자에 연결된 롤·Steam 계정, 주인 지정·해제)
        │              (롤 소환사와 Steam 계정은 owner_id로 로그인 사용자=멤버에 연결. 등록자가 기본 주인, 지정·해제 가능)
        └─ admin       관리자 전용 (접속자/차단, 목록, 시스템 상태, 캐시 비우기)
        │
        ▼
Neon Postgres (로그인 테이블 user/session/account/verification, 소환사 목록, Riot 캐시/통계/오류)
```
- 브라우저는 Riot API 키를 갖지 않습니다. 모든 Riot 호출은 `/api/riot`을 거칩니다.
- 로그인하지 않았거나 차단된 사용자는 어떤 화면과 API도 쓸 수 없습니다.

## 프런트엔드·서버 구조
```
src/
├─ app/                     화면 조립(라우팅). features/server를 사용하는 유일한 곳
├─ components/              앱 공용 UI (사이드바, 관리자 대시보드)
├─ features/
│  └─ lol/                  리그 오브 레전드 기능
│     ├─ index.ts           공개 인터페이스 (바깥은 여기만 import)
│     ├─ state/             LolProvider (화면들이 공유하는 상태/동작)
│     ├─ api/               riot.ts(Riot 클라이언트), lolData.ts(lookup/overview/details), roster.ts
│     ├─ domain/            순수 로직 (응답 변환, 요약 계산, 챔피언 표)
│     └─ components/        화면
└─ server/                  서버 전용
   ├─ auth.ts, discord.ts, viewer.ts   로그인 설정 / 서버 멤버 확인 / 요청 사용자와 접근 제어
   ├─ http.ts                          zod로 요청 body·query 검증 (parseBody, parseQuery)
   ├─ env.ts                           환경변수 점검 (값이 비었거나 형식이 틀린 것을 이름만 알려줌)
   ├─ db.ts, pool.ts                   Postgres 연결 (스키마는 만들지 않음: migrations/가 담당)
   ├─ admin.ts                         관리자 대시보드 조회/조작 (SQL은 여기에만)
   ├─ lol/roster.ts                    소환사 목록 서비스
   └─ riot/                            허용 경로·TTL(routes), 캐시/통계(cache), 프록시 본체(proxy)
```
- **라우트 핸들러(`src/app/api`)는 얇게**: 인증 -> zod 검증 -> 서비스 호출 -> 응답만 합니다. SQL과 로직은 `src/server`의 서비스 모듈에 있고 거기서 테스트합니다.
- **의존 방향**: `app -> features / server`. 공용 UI는 기능과 서버를 모르고(값은 props로 받음), 기능은 화면·서버·다른 기능을 가져오지 않고, 서버는 화면과 기능을 가져오지 않습니다. 새 카테고리는 `src/features/<이름>/`에 `index.ts`와 함께 추가합니다.
- 이 규칙은 `npm run lint`가 검사합니다(`no-restricted-imports`). 어기면 린트가 실패하고 CI에서도 막힙니다.
- Riot 데이터 접근은 `RiotClient` 인터페이스 뒤에 있어(지역, 주소 형식, 캐시 키는 호출자가 모름) 테스트에서는 가짜로 바꿔 끼웁니다.
- Data Dragon 정적 이미지 버전은 `src/features/lol/domain/images.ts` 한 곳에서 관리합니다. 새 패치로 갱신할 때 `domain/champions.ts`의 ID·이미지 이름도 함께 확인합니다. `RiotImage`가 로드 실패를 로컬 SVG로 대체하며, 다른 챔피언 이미지를 대체용으로 사용하지 않습니다.
- **새 주제(롤, Steam 같은 큰 단위)를 추가하는 법**: ① `src/features/<이름>/`에 기능과 `index.ts`(화면, 홈 카드용 `<이름>HomeSummary`) 만들기 ② `src/components/nav.tsx`에 상세 메뉴와 `sectionsFor`/`sectionOf` 한 줄씩 ③ `src/app/(app)/<주소>/page.tsx` ④ `src/app/(app)/home.tsx` 또는 같이 놀기·우리 기록 허브에 진입 링크 추가. 서버 로직은 `src/server/<이름>/`, API는 `/api/<이름>/...`.
- API URL(`/api/riot`, `/api/members`)과 DB 테이블 이름은 아직 롤 기준입니다. 두 번째 카테고리가 생길 때 `/api/<카테고리>/...`로 나눕니다.

### 오류 진단

- 공통 API 500 응답은 `requestId`와 `X-Request-ID` 헤더를 반환합니다. 서버 로그의 `[failure]`에서 같은 ID를 검색하면 고정된 작업 이름(`operation`), 오류 분류(`code`), HTTP 상태(있는 경우), 파일·행·열(`locations`), 중첩 원인(`cause`)을 확인할 수 있습니다. ID는 실패마다 새로 생성하며 사용자·세션을 식별하지 않습니다. 원문 예외 메시지·요청 URL·본문·외부 응답·비밀값은 기록하지 않습니다. 분류되지 않은 오류는 `unexpected`이며 빌드된 코드의 위치는 해당 배포 버전에서 확인합니다. 외부 플랫폼의 요청 ID와는 별개입니다.
- 홈·커뮤니티의 선택적 조회도 실패를 작업 이름과 함께 기록하고 기존 부분 표시를 유지합니다. 커뮤니티의 선택적 목록은 화면에서 여전히 빈 목록으로 대체되므로 서버 로그로 구분합니다.
- 소환사 목록 요청은 HTTP 상태와 오류 ID를 보존합니다. 저장 실패 안내는 세션 만료·권한·중복을 구분하며, 목록 재조회까지 실패하면 두 원인을 안내합니다. 추가 후 기본 정보 갱신은 저장 성공 후 실행해 저장 실패 안내를 지우지 않습니다.
- 롤 상세 조회는 숙련도·전적·실시간 게임의 부분 실패를 결과의 `failures`에 남깁니다. 상세 모달에서 실패 항목을 알리고 실패한 항목의 기존 데이터를 보존합니다(일부 경기만 성공하면 성공한 경기 목록 표시). 전적 조회 실패를 정상적인 빈 전적으로 안내하지 않으며 상세 화면을 다시 열면 재시도합니다.
- 관련 회귀 검사: `npm test -- src/server/http.test.ts src/features/lol/api/roster.test.ts src/features/lol/api/lolData.test.ts`, 브라우저 상태 복구: `npm run test:e2e -- e2e/diagnostics.spec.ts --retries=0`(격리된 테스트 DB 필요).

### 단순한 구조와 재현 가능한 디버깅

화면은 표시·사용자 입력을, 기능의 상태 모듈은 비동기 작업과 상태 전이를, 서버는 DB·외부 연동을 담당합니다. 파일 크기만으로 나누거나 가상의 확장에 대비한 계층을 추가하지 않습니다. 복잡한 계산과 비동기 순서가 실제로 달라지는 지점을 작은 공개 인터페이스로 테스트합니다.

| 확인할 동작 | 구현과 직접 재현 테스트 |
|---|---|
| 롤 목록·갱신·저장 실패 복구·상세 조회 | [rosterModel.ts](src/features/lol/state/rosterModel.ts), `state/rosterModel.test.ts`. `LolProvider`는 모듈의 snapshot을 구독해 기존 화면 인터페이스를 제공합니다. 초기 목록 조회는 공유하고, 오래된 요청은 새 요청·편집한 계정을 덮어쓰지 않습니다. 저장 실패 복구도 그 뒤 시작한 편집을 지우지 않습니다. |
| Steam 선택·비교·추천·뽑기·도전 | [gamesModel.ts](src/features/steam/gamesModel.ts), `gamesModel.test.ts`. 선택한 조건과 그 결과를 한 snapshot으로 관리하고, 요청 중 조건 변경과 중복 실행을 모듈 자체에서 막습니다. 검색·조건 변경 시 관련 뽑기·도전 결과도 함께 정리합니다. |
| 듀오 경기 집계 | [synergy.ts](src/features/lol/domain/synergy.ts), `domain/synergy.test.ts`. 경기 ID와 전체 Riot ID를 불투명한 문자열로 취급합니다. `_` 등 구분자로 다시 나누지 않으며 같은 경기가 두 사람의 전적에 있어도 한 번만 집계합니다. 이름이 같고 태그가 다르면 다른 사람입니다. |
| 앱 공용 UI의 HTTP 응답·오류 | [http-client.ts](src/lib/http-client.ts), `http-client.test.ts`. 관리자·운영 화면의 중복 응답 처리를 공유하며 HTTP 상태·오류 ID, 연결 실패와 응답 형식 오류를 보존합니다. 기능별 API 모듈은 기존 의존 방향과 도메인 오류 안내를 유지합니다. |
| 서버의 선택적 실패와 외부 응답 | [diagnostics.ts](src/server/diagnostics.ts), `server/http.test.ts`, `server/cache-diagnostics.test.ts`, `server/riot/proxy.test.ts`. 캐시·통계·운영 완료 기록 실패는 원문 대신 작업·안전한 원인 코드를 남깁니다. Riot 성공 상태의 JSON 파싱 실패는 502이며 캐시하지 않습니다. JSON 아닌 오류 응답도 원래 401·403·429·5xx를 유지하며, 네트워크 실패와 타임아웃을 구분합니다. |

두 상태 모듈은 React·타이머·전역 상태 없이 만들어지며 API를 테스트용 응답으로 교체할 수 있습니다. snapshot은 변경 때만 교체하고 구독 해제 함수를 제공합니다. 서버 렌더링·hydration에는 고정된 초기 snapshot을 사용합니다. UI·API·DB를 함께 확인하는 기존 E2E도 계속 유지합니다.

빠른 상태·계산 재현: `npm test -- src/features/lol/state/rosterModel.test.ts src/features/steam/gamesModel.test.ts src/features/lol/domain/synergy.test.ts`. 전체 변경 검증은 위 코드 검증 명령과 아래 E2E 기준을 따릅니다.

## 디스코드 연결 자동 연동
로그인할 때 디스코드 권한 `connections`로 사용자가 **디스코드에 연결해 둔 앱을 모두 훑어**, 우리 주제에 맞는 종류는 그 사용자의 멤버 계정으로 자동으로 묶습니다(`src/server/discord-connections.ts`). 지금은 Steam(`steam`)과 롤(`riotgames`, `leagueoflegends`)을 가져옵니다.
- 이미 등록된 계정이면 **주인이 비어 있을 때만** 주인으로 지정하고(다른 사람의 계정을 가로채지 않음), 없으면 새로 등록합니다. Steam의 이름과 아바타는 Steam에서 받고, `STEAM_API_KEY`가 없거나 실패하면 연결에 적힌 이름을 씁니다.
- 연결 목록을 못 읽거나 처리가 실패해도 **로그인은 항상 성공**합니다. 한 처리기가 실패해도 다른 처리기는 계속합니다. 연결 목록은 저장하지 않고 위 처리에만 씁니다.
- 연결 목록 조회 완료와 Steam·롤 계정 등록은 로그인 응답을 기다리게 하지 않습니다. 세션과 권한을 먼저 반영하고 Next.js `after`에서 연결을 마칩니다. 첫 화면에는 자동 연결이 아직 보이지 않을 수 있으며 완료 후 새로고침하면 반영됩니다. 실패한 연결은 다음 로그인에서 다시 시도합니다.
- 이 권한이 추가되기 전에 로그인한 사용자는 **다시 로그인**해야 적용됩니다(디스코드 동의 화면에 "연결된 계정 보기"가 추가로 표시됨).
- 서버 로그에 로그인마다 `discord connection types: …; unhandled: …`가 남습니다(계정 이름·id는 남기지 않고 **종류 이름만**). 공식 문서의 서비스 목록에 Riot이 없어서 실제로 어떤 종류로 오는지 이 줄로 확인하고, `unhandled`에 나온 종류는 아직 처리기가 없는 것입니다.
- **새 주제의 연결을 추가하려면**: `src/server/<이름>/connection.ts`에 `ConnectionHandler`(`types`, `link`)를 만들고 `discord-connections.ts`의 `HANDLERS`에 한 줄 더합니다.

## 디스코드 게임 추천 명령

`/게임추천`은 AI 없이 기존 Steam 추천을 디스코드에서 실행합니다. 선택 옵션 `범위`는 **모두 보유**(기본), **일부 보유 포함**, **전원 미보유**입니다. 명령을 실행하면 본인에게만 친구 선택창이 나타나며, 함께할 서버 멤버 **2~20명**을 고르면 추천을 시작합니다. 본인도 참여하면 직접 선택해야 합니다. 결과도 본인에게만 표시하며, 최대 5개의 게임·지원 유형·스토어 링크를 보여줍니다. 추천 기준은 기존 `balanced`이고 최대 인원은 스토어에서 확인합니다. 선택창은 15분 후 만료되므로 `/게임추천`을 다시 실행합니다.

- 지정한 `DISCORD_GUILD_ID` 서버에서만 받습니다. 요청자는 사이트에 디스코드로 가입한 차단되지 않은 사용자여야 하며, 명령과 선택 때마다 DB에서 다시 확인합니다. 웹 세션 쿠키를 대신 받아 쓰거나 사용자를 자동 가입시키지 않습니다.
- 선택한 친구마다 프로젝트의 디스코드 계정과 연결된 Steam 계정이 정확히 하나 있어야 합니다. 연결 없음·차단·여러 계정 연결은 안내하고 멈추며 이름으로 계정을 추측하지 않습니다. 공개 보유 목록 확인 실패·지원 정보 실패·후보 없음은 기존 추천 결과를 구분해 안내합니다.
- `POST /api/discord/interactions`는 선택 환경변수 **`DISCORD_PUBLIC_KEY`**(Discord Developer Portal → General Information → Public Key, 64자리 16진수)로 원문 바이트의 Ed25519 서명을 검증합니다. 서명 없음·위조·5분을 벗어난 타임스탬프는 401, 공개키 미설정은 503입니다. 서명된 PING에 PONG을 반환합니다. 이 키는 봇 토큰이나 Client Secret과 다릅니다.
- DB·Steam 조회 전에 비공개 지연 응답을 반환하고 Next.js `after`에서 결과를 전달합니다. 처리 예산은 45초, 라우트 최대 실행 시간은 60초입니다. 제한 초과 시 재시도 안내를 보내고 늦게 끝난 결과로 덮어쓰지 않습니다. 기존 공유 Steam 요청은 취소하지 않으며 별도 작업 큐·영구 재전송은 없습니다. Discord 답변 수정은 네트워크·5xx·1초 이내 429 대기와 404의 Unknown Message(10008)·Unknown Webhook(10015)에 한해 최대 3회 시도합니다. 최초 지연 응답이 Discord에 반영되기 전 후속 수정이 도착할 가능성에 대비해 해당 404는 250ms·500ms 후 재시도하며, 지속되는 무효 토큰은 같은 예산 안에서 실패합니다. 실패 로그에는 숫자 오류 코드·HTTP 상태만 남깁니다. 토큰·본문은 기록하지 않습니다.

운영 활성화는 배포·환경변수·Discord 앱 설정 변경에 대한 기존 사전 확인을 거친 뒤 진행합니다. 현재 코드가 추가됐다는 사실만으로 명령이 등록되거나 앱이 활성화되지는 않습니다.

1. 기존 Discord 로그인·수집과 **같은 앱**의 공개키를 `DISCORD_PUBLIC_KEY`에 설정하고 재배포합니다.
2. 해당 앱의 **Interactions Endpoint URL**을 `https://<도메인>/api/discord/interactions`로 설정합니다. 이 방식은 Gateway로 interactions를 받는 방식과 양립하지 않으므로, 기존 앱에서 다른 명령을 처리 중인지 먼저 확인합니다. REST 채팅 수집에는 영향을 주지 않습니다.
3. 앱의 서버 설치에 `applications.commands` scope가 포함돼 있는지 확인합니다. `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`은 같은 앱·서버의 기존 설정을 사용합니다. 상시 실행 봇이나 Message Content Intent는 필요하지 않습니다.
4. 로컬 미리보기: `npm run discord:register -- --dry-run`. 승인된 실제 등록: `npm run discord:register -- --apply`. 인자를 생략하면 미리보기만 수행합니다. 지정 서버의 `/게임추천` 하나만 POST로 등록·갱신하며 다른 명령은 삭제하지 않습니다. 실패 시 상태 코드·앱/서버 권한을 확인하고, 429는 기다린 뒤 재실행합니다. 등록·갱신은 같은 이름 기준이므로 재실행할 수 있습니다.
5. 디스코드에서 세 범위, 계정 연결 없음, 비공개 목록과 실제 답변 표시를 확인합니다. 운영에서 활성화하기 전까지 실제 Discord UI·콜드 스타트 응답 시간은 로컬 검증으로 대체할 수 없습니다.

구현은 `src/server/discord-interactions/`, 등록 정의는 같은 디렉터리의 `command.json`에 있습니다. 테스트: `npm test -- src/server/discord-interactions scripts/register-discord-command.test.ts`, 격리 DB의 계정 연결 검증은 `TEST_DATABASE_URL`이 필요합니다. 서명된 실제 HTTP 요청은 `e2e/discord.spec.ts`로 확인하며, Discord 웹훅·Steam 응답은 단위 테스트의 fixture를 사용합니다. Node가 PATH에 없으면 위 명령 앞부분을 `rtk proxy bash scripts/agent-npm.sh`로 바꿉니다.

공식 규격: [Discord interactions](https://docs.discord.com/developers/interactions/receiving-and-responding), [사용자 선택 메뉴](https://docs.discord.com/developers/components/reference#user-select), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).

## 채팅 하이라이트 (홈의 명예의 전당·수다 통계)
디스코드 채널의 **메타데이터**(누가, 언제, 반응이 몇 개)만 집계해 홈에 보여줍니다. **글 내용은 읽지도 저장하지도 않습니다**(기본값): 봇에 메시지 내용 권한(MESSAGE_CONTENT)을 주지 않으면 디스코드가 내용을 빈 값으로 보내고, 우리는 그것을 쓰지 않습니다. 답글이 어느 메시지에 대한 것인지(`message_reference`)는 내용 권한 없이도 옵니다. 선택 기능인 웃음 분석을 켜면 이 설명이 아래 "웃음 분석"으로 바뀝니다.
- 이름에 `⛵`가 들어간 텍스트·공지 채널만 봅니다(`src/server/chat/sync.ts`의 `WATCH_MARK`).
- 하루 한 번 Vercel 크론(`vercel.json`)이 `GET /api/cron/chat`을 불러 최근 7일을 REST로 가져와 `chat_messages`에 저장합니다(반응 수는 변하므로 매번 갱신, 60일 지난 기록은 삭제). 이 경로는 로그인 세션이 아니라 `CRON_SECRET`(Bearer)으로 보호하며, 설정이 없으면 누구도 호출할 수 없습니다.
- 동기화가 전체 채널을 읽은 날에는 원본 삭제 전에 최근 60일의 날짜별 메시지·답글·반응·활동 작성자 **수**를 `discord_daily_activity`에 다시 계산해 남깁니다. 한국 시간 날짜만 저장하며 작성자·채널 식별자는 이 장기 집계에 넣지 않습니다. 부분 동기화 중에는 갱신하지 않고, 기록이 없는 날은 활동이 없었다고 단정하지 않습니다.
- Riot·Steam의 장기 활동 저장 구조(`migrations/0010_activity_facts.sql`)와 중복 방지 로직은 준비돼 있습니다. Steam은 요청된 계정만 주간 간격으로 고르고 실패·조회 불가를 기록하는 수집 작업(`migrations/0011_steam_collection_state.sql`)도 준비했지만, 호출 경로나 예약 작업에는 연결하지 않았습니다. Riot 제품 등록 범위 확인과 Steam 계정 주인의 명시적 요청·고지 절차를 마친 뒤 활성화합니다. 설계와 근거는 [활동 데이터 수집 설계안](docs/activity-data-design.md)에 정리했습니다.
- Steam 활동 기록 설정은 Steam OpenID로 확인한 계정에만 표시합니다(`migrations/0012_steam_verified_accounts.sql`). 확인 후에도 주간 수집은 별도 요청이 필요하며, 중단·기록 삭제가 가능합니다. 저장 국가가 확인되지 않아 현재 요청 API는 503을 반환하고 버튼도 숨깁니다. 수집 작업과 Cron은 여전히 연결되지 않았습니다. [Steam 활동 데이터 안내](/privacy/steam)는 공개 경로입니다.
- 필요한 환경변수(둘 다 선택, 없으면 기능이 꺼짐): `DISCORD_BOT_TOKEN`(개발자 포털의 같은 앱에서 봇을 만들고 서버에 초대. 권한은 **채널 보기, 메시지 기록 읽기**만), `CRON_SECRET`(16자 이상 랜덤, `openssl rand -base64 24`).
- 처음 한 번 바로 채우려면(배포 후): `curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/chat` — 응답은 개수만 담습니다.

## 커뮤 (개념글 보관함, 뜨거웠던 순간, 주간 시상식)
위 채팅 집계를 바탕으로 사이트에 쌓이는 것들입니다. 주요 메뉴 **우리 기록**의 개념글·시상식 링크로 들어갑니다. 반응(이모지)을 적게 쓰는 방이라, 반응에만 기대지 않고 **답글**과 **메시지가 몰린 정도**를 함께 씁니다.
- **개념글**(`/community`): 매일 최근 8일 중 `반응 수 + 받은 답글 수`가 가장 큰 메시지 상위 5개(점수 2 이상)가 보관함(`chat_highlights`)에 들어갑니다. 절대 기준이 없는 순위 방식이라 비어 있지 않습니다. 한 번 들어가면 남고(채팅 원본은 60일만 보관), 클릭하면 디스코드의 그 메시지로 이동합니다. 개수와 최소 점수는 `src/server/chat/highlights.ts`에서 조정합니다.
- **뜨거웠던 순간**: 10분 동안 3명 이상이 10개 이상 말한 구간(같은 날은 가장 뜨거운 하나). 그 구간의 첫 메시지로 이동합니다(`src/server/chat/moments.ts`).
- **시상식**(`/community/awards`): 한국 시간 월~일을 한 주로, 끝난 주의 칭호를 매일 새벽 크론이 계산해 저장합니다(`chat_awards`). 칭호: 수다 갤러(메시지 수), 새벽 갤러(2~6시), 떡밥 갤러(받은 답글), 한 방 갤러(메시지 하나의 반응+답글), 답장 갤러(답장 수), 눈팅러(로그인만 하고 채팅은 안 한 멤버), 그리고 웃음 분석을 켰을 때만 웃음 유발자와 ㅋ 갤러. 이름과 설명은 `src/lib/titles.ts`, 계산과 기준은 `src/server/chat/awards.ts`에서 고칩니다. 한 주의 메시지가 20개 미만이면 만들지 않습니다. 받은 칭호는 멤버 프로필에 모입니다.
- 채팅 동기화는 채널별 마지막 완료 시각을 기준으로 평소에 **최근 3일만** 새로고침하고(반응·답글은 보통 그 안에 정해짐), 처음이거나 크론이 빠져 빈 구간이 있으면 그만큼(최대 8일) 거슬러 올라갑니다(`syncCutoff`). `chat_sync_state`에 조회 시작 시각·기간·다음 페이지 위치를 저장해 호출 한도나 60페이지 제한으로 중단돼도 다음 실행에서 이어 받습니다. 과거 조회를 마친 뒤에는 중단 중 새로 생긴 메시지도 확인합니다. 아직 시도하지 못한 채널을 우선하며, 부분 동기화 중에는 주간 칭호를 갱신하지 않습니다. 칭호 교체는 트랜잭션으로 처리해 저장 실패 시 기존 결과를 유지합니다.

### 웃음 분석 (선택, 기본 꺼짐)
이 방의 웃음 신호는 반응이 아니라 "ㅋㅋㅋ"라서, 켜면 **웃음 유발 메시지**(그 말 직후 2분 안에 다른 사람들의 ㅋ가 가장 많이 터진 메시지)와 웃음 유발자·ㅋ 갤러 칭호가 생깁니다.
- 봇이 글을 읽지만 **ㅋ/ㅎ 글자 수(메시지당 최대 30)만 세고 글은 바로 버립니다.** 글 내용은 DB나 로그에 남지 않습니다(테스트로 확인). 화면의 안내 문구도 이때는 "읽지만 저장하지 않고 숫자만 집계"로 바뀝니다.
- **두 단계를 모두 켜야** 동작합니다. 하나라도 빠지면 디스코드가 내용을 빈 값으로 보내거나 코드가 읽지 않아 아무것도 읽지 않습니다. ① 개발자 포털 → 앱 → Bot → **Message Content Intent** 켜기 ② Vercel 환경변수 `CHAT_LAUGH=1` 후 재배포. **친구들에게 먼저 알린 뒤** 켭니다.

## 화면 열람 집계
어느 화면이 실제로 쓰이는지 보려고 화면별 하루 열람 횟수만 셉니다(`page_views`, 관리자 화면의 "화면별 열람"). **누가 열었는지(사용자, IP)는 저장하지 않습니다.** 로그인한 사용자가 화면을 열 때 브라우저가 `POST /api/track`을 부르고, 서버에서 관리자 요청을 제외한 뒤 `src/lib/track.ts`의 목록에 있는 화면만 셉니다(프로필처럼 주소에 id가 들어가는 화면은 id를 버리고 하나로 합칩니다). 개발 로그인 우회의 관리자도 제외합니다. 기존 집계에는 사용자 구분이 없어 이전 관리자 열람을 소급해서 제거하지는 않습니다. 새 화면을 만들면 그 목록에 한 줄 더합니다.

## 관리자
- **운영 상태**: 장애·복구 알림, 채팅 동기화 기록/재실행, Steam 캐시·오류 통계, 관리자 작업 이력, 기간별 열람 비교와 운영 현황 내보내기. 자동 감시 설정·백업·격리 복구·장애 대응은 [OPERATIONS.md](OPERATIONS.md)를 참고하세요.
- 디스코드 서버 **소유자이거나 Administrator 권한**이 있는 사용자는 로그인 시 자동으로 관리자가 됩니다. 관리자를 추가하려면 디스코드에서 권한만 주면 됩니다(재로그인 필요).
- 환경변수가 비었거나 형식이 틀리면(예: 값 자리에 변수 이름을 그대로 넣은 경우) 관리자 탭 위쪽에 경고가 뜨고 서버 시작 로그에도 남습니다. 값은 표시하지 않습니다.
- 사이드바의 **관리자** 탭에서 접속자 목록과 차단/해제, 등록 소환사 삭제, 시스템 상태(Riot 캐시, DB 사용량, Riot 호출 통계, 최근 Riot 오류), 캐시 비우기를 합니다.
- 차단하면 그 사용자의 세션을 모두 지워 **즉시** 로그아웃되고, 로그인도 거부됩니다. 관리자는 차단할 수 없습니다.
- 관리자 여부와 접속 기록은 로그인할 때마다 디스코드 서버 권한을 기준으로 갱신됩니다.

## 환경변수 (Vercel → Settings → Environment Variables, Production / 로컬은 `.env.local`)
| 이름 | 설명 |
|---|---|
| `RIOT_API_KEY` | Riot API 키 |
| `DISCORD_CLIENT_ID` | Discord 앱의 Client ID |
| `DISCORD_CLIENT_SECRET` | Discord 앱의 Client Secret |
| `DISCORD_GUILD_ID` | 접속을 허용할 디스코드 서버 ID |
| `DISCORD_PUBLIC_KEY` | (선택) 슬래시 명령 HTTP 요청의 서명 검증용 공개키(64자리 16진수). 미설정 시 명령 API는 꺼짐 |
| `SESSION_SECRET` | 로그인 비밀키(세션 서명용) 랜덤 문자열, 32자 이상 (`openssl rand -base64 32`) |
| `STEAM_API_KEY` | (선택) Steam Web API 키. 없으면 Steam 기능은 503을 돌려줍니다. 32자리 16진수. |
| `NVIDIA_API_KEY` | (선택) 재순이 AI 해설용 NVIDIA API 키. 서버에서만 사용하며 미설정이면 AI 요청만 503을 반환합니다. |
| `DATABASE_URL` | Postgres 연결 문자열 (Vercel에서 Neon을 연결하면 자동 등록) |
| `DATABASE_URL_UNPOOLED` | (선택) 마이그레이션이 우선 사용하는 직접 연결 주소. Neon 연동이 자동 등록합니다. |
| `TEST_DATABASE_URL` | (선택) DB 통합 테스트용. 없으면 해당 테스트는 건너뜁니다. 개발 DB와 분리된 빈 DB를 쓰세요. |
| `DEV_LOGIN` | `1`이면 **개발 서버에서만** 디스코드 로그인 없이 관리자로 접속 (운영 빌드에서는 무시됨) |
| `OPS_ALERT_WEBHOOK_URL` | (선택) 운영 장애·복구 알림 전용 Discord webhook URL. Vercel 환경변수와 GitHub Actions secret에 각각 설정. URL의 토큰은 비밀값으로 취급합니다. |

Discord 앱의 OAuth2 Redirects에는 실제 접속 도메인 기준으로 `https://<도메인>/api/auth/callback/discord`를 등록합니다. 도메인이 `www`로 리다이렉트되면 `www` 주소를 등록해야 합니다. 로컬에서 실제 로그인을 시험하려면 `http://localhost:3000/api/auth/callback/discord`도 추가합니다. 리다이렉트 주소는 요청에서 자동으로 정해지므로 별도 URL 환경변수는 필요 없습니다.

## DB 마이그레이션
스키마는 `migrations/NNNN_이름.sql` 파일이 정의합니다. 요청 중에 테이블을 만들지 않습니다.
```bash
npm run db:migrate   # 아직 적용되지 않은 파일을 번호순으로 적용 (.env.local의 DB 주소 사용)
```
- 적용 이력은 `schema_migrations` 테이블에 파일 이름과 체크섬으로 기록됩니다. **이미 적용된 파일을 고치면 실패**하므로, 변경은 항상 **다음 번호의 새 파일**로 추가합니다(예: `0002_add_foo.sql`).
- 파일 하나는 하나의 트랜잭션입니다. 실패하면 그 파일은 반영되지 않습니다. 동시에 실행돼도 락으로 한 번만 적용됩니다.
- **배포 때 자동 실행**: Vercel 빌드 명령이 `node scripts/migrate.mjs && next build`입니다(`vercel.json`). 마이그레이션이 실패하면 배포가 멈추고 이전 배포가 계속 서비스됩니다. Neon 연동이 `DATABASE_URL_UNPOOLED`를 주면 그 직접 연결을 우선 사용하고, DB 주소가 없으면(CI 등) 건너뜁니다.
- 새 배포 코드가 먼저 켜지기 전에 DB가 바뀌므로, 마이그레이션은 **이전 버전 코드와도 호환**되게 작성합니다(컬럼 추가는 안전, 삭제·이름 변경은 먼저 코드에서 쓰지 않게 한 뒤 다음 배포에서).
- 로그인 라이브러리 테이블(`user` 등)도 이 파일들이 만듭니다. `user`에 필드를 추가하거나 라이브러리를 올릴 때 마이그레이션을 빼먹으면 `schema-drift` 테스트가 실패합니다.
- 예전 버전이 만들던 `users` 테이블(디스코드 ID 기반 접속 기록)은 `0002_drop_legacy_users.sql`에서 삭제됩니다. 되돌릴 수 없으므로(복원은 Neon 시점 복구뿐) 같은 이름의 현재 테이블 `"user"`(단수형)와 혼동하지 마세요.

## 로컬 개발
```bash
npm install
cp .env.example .env.local   # 값을 채웁니다 (없으면 아래 예시 참고)
npm run db:migrate            # 처음 한 번, 그리고 migrations/에 새 파일이 생길 때마다
npm run dev                   # http://localhost:3000
```
### Codex·Claude Code 공통 개발 환경변수 관리

| 위치 | 역할 |
|---|---|
| [`.env.example`](.env.example) | Git에 보관하는 키 이름·형식·용도. 실제 비밀값은 넣지 않음 |
| Vercel Development | 클라우드 개발 실행에 필요한 설정. 비밀키는 Secret으로 저장하며 로컬 보관 원본을 대체하지 않음 |
| Vercel Production | 운영용 값. 개발용으로 자동 다운로드하거나 복제하지 않음 |
| 공용 Git 폴더의 `jaemangho-dev-env/development.env` | 이 컴퓨터에서 값을 잊지 않고 다시 찾을 기준 파일. 모든 worktree가 재사용하며 디렉터리 0700·파일 0600, Git 커밋 대상이 아님 |
| 각 worktree의 `.env.local` | 실행용 복사본. 이미 있는 파일은 자동으로 덮어쓰지 않음 |

준비 도구는 Python 3·Git만으로 동작합니다. 새 worktree를 만들 때 로그인·클라우드 조회·의존성 설치를 반복하지 않습니다. 이 컴퓨터의 공유 사본에는 실제 값이 평문으로 들어 있으므로 OS 계정·디스크 암호화로 보호하고 로그·대화·Git에 넣지 않습니다. Vercel Secret은 저장 후 다시 읽을 수 없습니다. 발급한 값은 이 공용 파일에 보관하며 컴퓨터 분실·초기화에 대비한 암호화 백업은 별도로 필요합니다. 키를 바꿀 때는 현재 `.env.local`에 입력한 뒤 아래 `import --replace`로 공용 파일을 갱신하고, 해당 키를 사용하는 Vercel 환경에도 별도로 반영합니다. 로컬 실행은 `.env.local`, Vercel 배포는 Vercel 설정, GitHub Actions는 워크플로의 Secrets·Variables를 사용합니다.

최초 한 번 개발용 `.env.local`을 준비하고 등록합니다. `import`는 값의 발급 환경을 추론할 수 없으므로 `--confirm-development`로 개발용임을 명시적으로 확인해야 합니다. 운영 파일을 가져오지 마세요.

```bash
rtk proxy python3 scripts/dev-env.py import --source .env.local --confirm-development
rtk proxy python3 scripts/dev-env.py install
```

`install`은 이 저장소의 공용 `post-checkout` hook에 실행 도구를 연결합니다. 기본 checkout이 있는 `git worktree add`에는 hook이 실행되므로 Claude Code·터미널에서 공용 사본을 `.env.local`로 복사합니다. 새 브랜치에 도구 파일이 아직 없어도 공용 Git 폴더에 설치한 실행 사본이 동작합니다. 전역 Git 설정은 변경하지 않고, 기존 `core.hooksPath`나 `post-checkout`이 있으면 덮어쓰지 않고 연결 방법을 안내합니다. 원본 유효성·기존 대상 보존·오류 비밀값 숨김을 검사합니다. hook 실패는 표시되며 이미 생성된 worktree는 직접 복구해야 합니다.

Codex에는 [`.codex/environments/environment.toml`](.codex/environments/environment.toml)의 setup도 연결돼 있습니다. 앱에서 `Jaemangho` 로컬 환경을 선택해 새 worktree를 만들면 공통 복사 명령을 먼저 실행하며 Linux에서는 기존 의존성 설치도 수행합니다. 도구의 `create_worktree`처럼 setup을 선택하거나 Git hook을 실행하지 않는 경로가 있어 Git hook만으로 Codex의 모든 생성 경로를 보장하지 않습니다. setup이 실행되지 않았다면 [에이전트 규칙](AGENTS.md)에 따라 개발 시작 전에 같은 `sync` 명령을 수행합니다. 기존 파일은 모든 경로에서 보존됩니다. [OpenAI 로컬 환경 문서](https://learn.chatgpt.com/docs/environments/local-environment).

Claude Code에는 [`.claude/settings.json`](.claude/settings.json)의 `SessionStart` hook도 연결돼 있습니다. 프로젝트 설정을 포함한 브랜치에서 새 세션을 시작/재개하면 stdin의 `cwd`를 사용해 현재 worktree의 누락된 파일을 준비합니다. 실행기는 Git에서 공용 폴더를 조회하므로 `${CLAUDE_PROJECT_DIR}`가 출발 폴더를 계속 가리키더라도 복사 대상은 실제 worktree입니다. 다른 저장소에는 복사하지 않습니다. `--no-checkout`·hook 비활성화·아직 설치하지 않은 별도 clone에서는 자동 복사를 보장하지 않으며 다음 공통 명령으로 준비합니다. 별도 clone·새 컴퓨터는 최초 등록·설치를 다시 수행합니다.

```bash
rtk proxy python3 scripts/dev-env.py sync
rtk proxy python3 scripts/dev-env.py check --profile local
rtk proxy python3 scripts/dev-env.py check --profile discord
```

검사는 값을 출력하지 않고 누락된 키 이름만 알려줍니다. `local`은 DB·세션 키와 개발 로그인 또는 Discord 로그인 설정을 확인합니다. `discord`는 실제 로그인·슬래시 명령 등록·Steam 추천에 필요한 키를 확인하며, Steam·Riot는 각각 `--profile steam`, `--profile riot`로 확인합니다. 키의 형식 검사만으로 발급처의 유효성·권한이나 Discord 엔드포인트 연결까지 확인됐다고 하지 않습니다. 로컬 DB와 세션이 준비돼도 외부 키가 없으면 해당 연동은 미준비입니다.

Vercel Development의 읽을 수 있는 설정을 가져오려면 명시적으로 갱신합니다. 이 명령은 비밀키의 원본 복구 수단이 아닙니다. Production을 선택하는 옵션은 제공하지 않습니다. Vercel CLI 로그인은 별도로 필요하며, 설치된 CLI가 없으면 기존 Node 환경의 `agent-npm.sh`로 검증한 CLI 63.1.2를 실행합니다. 공유 설정이 비었거나 조회가 실패하면 기존 사본을 보존합니다. Vercel OIDC 등 CLI 세션 값은 공용 파일에 보관하지 않습니다. localhost DB 주소와 클라우드 응답에 없는 Discord·Steam·Riot 비밀키는 이 컴퓨터의 기존 공용 값을 유지합니다. Vercel에서 비밀키를 교체해도 그 새 값을 내려받을 수 없으므로 로컬 보관 파일도 함께 갱신해야 합니다. 새 컴퓨터에는 먼저 별도의 개발 DB를 준비하고 `import`로 로컬 사본을 초기화합니다.

`publish --confirm-development`는 공유 사본의 비어 있지 않은 개발용 키를 Development에만 등록합니다. DB 주소·운영 알림 URL은 보내지 않고 값은 stdin으로 전달합니다. Discord Client Secret·봇 토큰·Steam·Riot API 키는 Secret(`--sensitive`)으로 등록하며, 나머지는 Config(`--no-sensitive`)로 등록합니다. 읽기 가능한 Config에 세션·크론 비밀값을 등록하는 경우 해당 보안 설정과 범위에 대한 승인을 먼저 받습니다. 개발 DB·세션·크론을 운영에 복사하지 않습니다. 같은 Discord 앱을 개발과 운영에서 사용하는 경우 해당 앱의 자격 증명을 교체하면 양쪽과 기존 수집 봇 실행 환경도 갱신해야 합니다. 기존 키는 기본적으로 덮어쓰지 않으며 명시적인 `--replace`가 있어야 교체합니다. 여러 키 등록은 트랜잭션이 아니므로 일부 성공 후 실패하면 성공한 키 이름을 확인하고 나머지를 복구합니다. 등록 실패는 CLI 출력의 비밀값을 숨기고 로컬 원본을 유지합니다.

```bash
rtk proxy python3 scripts/dev-env.py refresh --confirm-development
# 기존 worktree에 적용할 때만 명시적으로 교체 (개별 설정을 먼저 보존하세요)
rtk proxy python3 scripts/dev-env.py sync --replace
```

로컬 원본을 직접 수정했다면 같은 `import` 명령에 `--replace`를 추가해 공용 사본을 갱신합니다. 새 worktree는 최신 사본을 사용하고 기존 worktree는 자동 변경되지 않습니다. 원본·대상 심볼릭 링크는 거부합니다. 값은 한 줄 형식만 지원하며 빈 키는 생략해 DB 마이그레이션의 직접 연결 주소 fallback을 방해하지 않습니다. Git hook 업데이트는 `install`을 다시 실행하고, Git hook 제거는 `uninstall`로 수행합니다(이 도구가 설치한 hook만 제거하며 원본·복사본은 보존). 자동 준비를 완전히 끄려면 Codex setup·Claude SessionStart 연결도 제거합니다.

검증: `rtk proxy python3 scripts/dev_env_test.py`. 실제 임시 Git 저장소/worktree 생성, 공백 경로, 권한, 기존 파일·hook 보존, Claude stdin 대상, 실패 시 원본 보존·비밀값 비출력과 Development 전용 조회를 확인합니다. 동작 기준: [Git post-checkout 문서](https://git-scm.com/docs/githooks#_post_checkout), [Claude Code hooks 문서](https://code.claude.com/docs/en/hooks#sessionstart).

`.env.local` 예시 (로그인 없이 개발하려면 `DEV_LOGIN=1`):
```
DATABASE_URL=...        # 운영 DB를 건드리지 않게 별도 DB를 쓰세요 (아래 Docker 예시 또는 Neon 개발 브랜치)
RIOT_API_KEY=RGAPI-...
SESSION_SECRET=아무거나
DEV_LOGIN=1
```
개발 서버도 운영과 같은 서버 라우트를 사용하므로 DB 연결이 필요합니다. 로컬 Postgres가 필요하면 Docker로 띄울 수 있습니다.
```bash
docker run -d --name jaemangho-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=jaemangho -p 127.0.0.1:54329:5432 postgres:17-alpine
# DATABASE_URL=postgres://postgres:dev@127.0.0.1:54329/jaemangho
```

```bash
npm run build   # 타입 검사 + 운영 빌드
npm run lint    # 코드 규칙 + 모듈 경계 검사
npm test        # 단위 + 통합 테스트 (vitest, TEST_DATABASE_URL이 있으면 DB 통합 테스트 포함)
npm run test:e2e   # 브라우저 E2E 테스트 (Playwright, 아래 참고)
```

로컬 완료 검증은 [에이전트 규칙의 변경 유형별 검증](AGENTS.md#변경-유형별-검증)을 따릅니다. 문서·테스트·독립 개발 도구는 각각 필요한 검사만 수행하고, 앱 코드·공용 모듈·설정·의존성 변경은 lint·test·build를 실행합니다. 영향 범위가 불명확하면 전체 코드 검증을 적용합니다. 빌드와 전체 테스트는 기본적으로 순차 실행하며 CI의 필수 검사는 계속 유지합니다.

에이전트 실행 환경에서 설치된 Node·npm이 PATH에 없다면 `rtk proxy bash scripts/agent-npm.sh <npm 인자>`를 사용합니다. 기존 nvm 설치에서 프로젝트 `.nvmrc`가 있으면 그 버전, 없으면 기본 버전을 활성화하며 인자·현재 디렉터리·종료 코드를 유지합니다. 새 런타임이나 의존성을 자동 설치하지 않습니다. 실행 도구의 회귀 검사는 `rtk proxy python3 scripts/agent_npm_test.py`로 실행합니다.

### CI 보안 검사

개인 소유 비공개 저장소에서 지원되지 않는 GitHub dependency review·CodeQL 대신, 러너에서 실행되는 검사를 사용합니다. [CI](.github/workflows/ci.yml)의 `dependency-review` 작업 이름은 유지하며 `npm ci --ignore-scripts` 후 `npm audit --audit-level=high`로 운영·개발 의존성 전체의 high 이상 취약점을 차단합니다. PR·merge group에서는 이 검사가 성공해야 `check`가 진행됩니다.

[Security scan](.github/workflows/security.yml)은 고정 버전 Semgrep Community Edition으로 `src`·`scripts`·`e2e`의 JavaScript·TypeScript 보안 규칙(수동 검토용 `audit` 규칙 제외)을, zizmor로 `.github/workflows`를 검사하며 발견 사항이나 실행 오류가 있으면 실패합니다. Semgrep 커뮤니티 규칙은 커밋·다운로드 체크섬을 고정하고 메트릭·버전 확인을 끕니다. zizmor는 오프라인으로 실행합니다. 외부 계정·비밀값·code scanning 업로드 권한 없이 실행되며 소스 코드를 업로드하지 않습니다. 로컬 재현 명령과 도구·규칙 버전은 해당 워크플로의 `run` 단계가 기준입니다. Semgrep Community Edition의 함수·파일 단위 분석은 CodeQL의 분석 범위와 동일하지 않습니다. 지원하지 않는 구문의 부분 파싱 경고는 로그에 남지만 검사를 중단하지 않습니다. TypeScript 문법·타입 검사는 기존 build가 맡습니다.

## E2E 테스트
실제 브라우저(Chromium)로 로그인 보호, 소환사 추가·삭제, 관리자 차단 흐름을 시험합니다 (`e2e/`).
```bash
npx playwright install chromium          # 처음 한 번
TEST_DATABASE_URL=postgres://... npm run test:e2e
```
- 운영과 같은 방식(마이그레이션 -> `next build` -> `next start`)으로 실행합니다. Playwright가 기존 `E2E_DATABASE_URL`을 테스트 빌드·서버에 전달하면 메모리 캐시만 꺼 공통 fixture가 테스트 사이 파일 캐시를 초기화합니다. 인증·라우팅·TTL과 이 변수가 없는 운영 빌드의 기본 설정은 그대로입니다. `3200` 포트가 이미 쓰이고 있으면 재사용하지 않고 멈춥니다.
- 디스코드 로그인은 외부 서비스라 쓰지 않습니다. DB에 사용자·세션을 만들고 로그인 라이브러리와 같은 방식으로 서명한 세션 쿠키를 브라우저에 넣습니다. Riot 응답은 브라우저의 `/api/riot` 요청을 가짜로 대체합니다(서버 프록시는 단위 테스트가 다룹니다).
- E2E 서버는 `e2e/env.ts`에서 봇 토큰과 운영 알림 webhook을 빈 값으로 덮어씁니다. 공용 `.env.local`이나 실행 환경에 실제 값이 있어도 테스트 DB의 감시 공백을 운영 채널에 알리거나 실제 채팅 수집을 실행하지 않습니다.
- 테스트가 만드는 데이터는 `e2e_` 접두사로 시작하고 끝나면 지웁니다. 개발 DB가 아닌 별도 DB를 쓰세요.
- 화면 테스트는 준비한 데이터를 바로 검증합니다. 60초 캐시 유지·만료·갱신은 `e2e/cache-expiry.spec.ts`에서 별도로 검사하며 전체 E2E에도 포함됩니다. 서버가 읽는 파일 캐시의 나이를 55초·65초로 설정해 실제 만료 처리를 검증하므로 물리적인 60초 대기는 없습니다. 캐시 내용과 운영 TTL은 유지하고, 홈 캐시 6개의 형식·60초 TTL이 바뀌면 명시적으로 실패합니다. 이 fixture는 현재 Next.js의 파일 수정 시각 기반 캐시에 의존하므로 라이브러리 갱신 시 관련 테스트를 확인합니다. 공유 DB를 쓰므로 worker는 1개를 유지합니다.
- UI 경로·접근 가능한 이름을 바꾸면 관련 E2E도 같은 변경에서 갱신하세요. PR 전에 격리 DB로 `npx playwright test e2e/<관련 파일>.spec.ts --retries=0`을 실행해 변경된 흐름을 먼저 확인하고, 최종 검증은 전체 E2E로 수행합니다.
- 실패하면 `test-results/`에 스크린샷과 트레이스가 남습니다 (`npx playwright show-trace <trace.zip>`). CI에서는 실패 시 리포트를 아티팩트로 올립니다.

## 배포
`main` 브랜치에 머지하면 Vercel이 자동 배포합니다. 환경변수를 바꾼 뒤에는 **재배포**해야 반영됩니다. Vercel 프로젝트의 `previewDeploymentsDisabled`를 `true`로 설정해 PR 프리뷰 배포를 생성하지 않습니다. PR은 GitHub Actions의 `check`·`e2e`로 검증합니다. `main` 이외 브랜치의 빌드를 건너뛰는 `vercel.json`의 `ignoreCommand`도 보조 방어로 유지합니다. 프리뷰 비활성화는 Vercel 프로젝트 설정이므로 프로젝트를 새로 만들거나 이전하면 같은 설정을 확인해야 합니다.

### 변경의 운영 반영 확인

CI 통과와 운영 반영은 서로 다른 결과입니다. 변경을 운영에서 확인할 때는 대상 PR 또는 정확한 커밋을 지정합니다.

```bash
npm run verify:production -- --pr 75 --wait 120
# PR 없이 특정 커밋을 확인하려면 --commit <40자리 SHA>
```

이 명령은 기존 GitHub CLI와 Vercel CLI 로그인으로 배포 정보를 읽고, 기존 smoke의 공개 경로 5개를 검사합니다. Node·npm이 PATH에 없다면 `rtk proxy bash scripts/agent-npm.sh run verify:production -- --pr 75 --wait 120`을 사용합니다. `gh`가 필요하고 Vercel CLI 63.1.2는 npm 실행 캐시를 사용합니다. 처음 실행할 때만 CLI 다운로드가 필요할 수 있습니다. CLI 인증에 실패하면 기존 계정으로 로그인한 뒤 재실행하며, 운영 환경변수 파일을 내려받지 않습니다.

`public_verified`와 종료 코드 0은 **요청한 머지 커밋이 운영 주소에 반영됐고 공개 검사 5개가 통과했다**는 뜻입니다. DB health는 고유 query로 캐시를 우회합니다. 검사 전후 배포 ID를 비교해 도중에 버전이 바뀌면 성공으로 처리하지 않습니다. 이후 다른 커밋이 배포된 경우에도 지정한 과거 커밋의 검증을 성공으로 대신하지 않습니다.

`not_merged`, `not_serving_commit`, `deployment_failed`, `deployment_changed`, `public_checks_failed`는 종료 코드 1이며, 배포 후보의 상태·오류 코드 또는 실패 경로·HTTP 상태를 표시합니다. `--wait`는 준비 중인 배포에만 최대 300초까지 적용합니다. 실패한 배포는 즉시 종료하고, 배포·재배포·롤백을 실행하지 않습니다. 개별 CLI 조회는 30초, 공개 요청은 15초 제한이며 진행 중인 조회 시간은 대기 기한에 추가될 수 있습니다. CLI의 원본 오류와 응답 본문·비밀값은 출력하지 않습니다.

**로그인 뒤 화면과 Discord 등 실제 외부 연동은 이 검사로 검증되지 않습니다.** 결과의 `authenticatedFlow: not_checked`를 유지하며 UI 오류는 문제가 발생한 실제 브라우저에서 확인합니다. 현재 운영 버전을 먼저 확인해 수정 전 버전을 반복 진단하지 않습니다. 구현은 [운영 반영 검증 도구](scripts/verify-production.mjs), 회귀 검증은 `npm test -- scripts/verify-production.test.mjs`입니다.

## 재순이 AI 대화

**재순이와 대화(`/chat`)**는 로그인한 사용자만 보는 개인 AI 대화방입니다. PC 채널 목록과 모바일 상단의 재순이 버튼으로 열며 기존 게임·전적 화면을 오가도 대화와 입력 초안이 이어집니다. 화면의 질문 예시는 초안만 채우고 **메시지 보내기** 또는 Enter로 전송합니다(Shift+Enter는 줄바꿈, 한글 조합 중 Enter는 전송하지 않음). 입력은 최대 600자입니다.

Steam 추천·비교·도전 결과, 롤 대시보드·듀오 시너지·숙련도, 홈 활동·개념글·시상식의 **자료 붙여서 대화하기**는 현재 화면 스냅샷을 첨부하고 대화방을 엽니다. 이 동작만으로 NVIDIA를 호출하지 않습니다. 오른쪽 참고 자료 패널에는 첨부 시점·범위·누락과 후보를 표시하며 1024px 이하에서는 참고 자료 버튼으로 열고 닫습니다. 원래 화면이 바뀌어도 첨부는 자동 갱신되지 않으며 다시 첨부해야 합니다. LoL 플레이어 번호 대응은 원래 화면에서 확인합니다. **첨부 해제**는 이후 메시지의 자료를 해제하며 과거 메시지에 보낸 자료는 유지합니다. 각 사용자 메시지는 당시 자료와 함께 기록되어 후속 질문에서도 서로 다른 스냅샷을 혼동하지 않게 합니다.

대화·초안·자료는 현재 탭의 앱 메모리에만 유지합니다. 새로고침·로그아웃하면 초기화되고 **새 대화 → 지우고 시작**으로도 초기화합니다. 탭 간 공유·DB 저장·장기 기억·공개 단체 채팅은 제공하지 않습니다. 답변 요청에는 최근 완료된 대화 최대 4턴(사용자·AI 8메시지, 자료 포함 직렬화 24,000자 이내)을 함께 보내며 초과한 과거 대화는 화면에 남더라도 모델이 참고하지 않습니다. 다른 화면이나 DB를 자동 검색하지 않습니다. 기존 계산·추천·칭호와 사용자 권한은 유지하며 AI 제안은 실제 기록과 함께 확인합니다.

- 서버에 `NVIDIA_API_KEY`를 설정합니다. 예제의 `$NVIDIA_API_KEY` 문자열을 값으로 넣지 않습니다. 로컬은 `.env.local`, 운영 환경 설정은 기존 사전 확인·재배포 절차를 따릅니다. 키를 대화·커밋·브라우저에 넣지 않습니다. 모델은 `z-ai/glm-5.3-flash`, 주소는 `https://integrate.api.nvidia.com/v1/chat/completions`로 서버에 고정하며 별도 SDK 의존성은 없습니다. 짧은 대화의 지연을 줄이기 위해 `reasoning_effort: low`를 지정합니다. 이 모델은 추론을 항상 사용하며 기본값은 `max`입니다([NVIDIA 공식 문서](https://docs.nvidia.com/nim/vision-language-models/latest/get-started/advanced/get-started-glm-5-3-flash.html#control-reasoning-effort)). 키의 모델 접근 권한·서비스 한도는 NVIDIA 계정에서 확인해야 합니다.
- 화면 진입·조건 변경만으로 AI를 호출하지 않습니다. 요청할 때 게임 제목·플레이 시간·추천 점수·보유 인원·도전 목표 또는 롤 챔피언·경기 수치, 활동·칭호 집계를 NVIDIA로 전송합니다. 닉네임·계정 ID·원문 링크·디스코드 대화 내용은 분석 자료에서 제외합니다. 롤은 최대 40명을 번호로 표시하고 현재 불러온 각 10경기·숙련도 5개와 실제 듀오 집계를 사용합니다. 번호와 닉네임 대응표는 브라우저에만 표시합니다. Steam은 검색된 결과 중 최대 12개와 도전 목표 최대 12개를 사용하며, 미확인 보유 목록·최근 기록·진행도와 조회 실패를 별도로 전달합니다.
- 질문에 직접 적은 내용도 외부에 전송되므로 개인정보·비밀값을 넣지 않습니다. 원문 응답·질문·분석 자료를 서버 로그나 DB 대화 이력으로 남기지 않습니다. 성공한 답변은 사용자·질문·대화·자료별 해시를 키로 서버 인스턴스 메모리에 최대 100개, 5분간 재사용합니다. 만료 항목은 다음 요청 때 제거되거나 인스턴스 종료 시 사라집니다. 제공사 측 데이터 처리·보존은 NVIDIA 정책을 별도로 확인해야 합니다.
- 로그인한 사용자만 `POST /api/ai`를 호출합니다. 입력은 서버의 허용 필드 검증을 거치고 본문은 128KB 이내입니다. 같은 사용자·자료·질문의 진행 중 요청은 공유하며 사용자별 한 번에 1개, 인스턴스 전체 4개, 사용자별 1분에 새 요청 6개를 제한합니다. 이 제한은 **인스턴스별 보호**이며 여러 서버 전체에 걸친 계정 비용 상한은 아닙니다. 자동 재시도·대기열은 없고 네트워크·인증·한도·응답 오류 뒤 수동 재시도가 가능합니다. 제공사 요청은 25초, 라우트는 30초 한도입니다. 실패 결과는 캐시하지 않습니다.
- 응답 대기 중 중복 전송을 막으며 오류 시 **답변 다시 받기**는 실패한 질문과 당시 자료로 재시도합니다. **질문 고치기**로 실패한 질문을 초안에 복원하고 앞선 대화를 유지할 수 있습니다. 새 대화 뒤 도착한 이전 응답은 표시하지 않습니다. AI 오류가 나도 기존 화면은 사용할 수 있습니다. 오류의 `requestId`로 서버 `[failure]`의 `api/ai.POST` 작업과 안전한 오류 코드·외부 HTTP 상태를 확인합니다. 키 미설정은 503, 인증·제공사·잘못된 응답은 502, 한도·혼잡은 429, 시간 초과는 504입니다. 생성 길이 제한에 걸린 답변은 잘렸음을 표시합니다.

책임은 `src/server/ai/`(입력·프롬프트·NVIDIA 통신·동시 요청/캐시), `src/features/ai/`(대화 상태·자료 전달·메시지 표시), `src/app/(app)/ai-context.ts`(기존 화면 자료에서 필요한 필드만 추출)로 나눕니다. `npm test -- src/server/ai src/features/ai 'src/app/(app)/ai-context.test.ts' src/app/api/ai src/server/env.test.ts`로 비밀값 없이 실패·재시도·중복·만료·가명 처리를 재현합니다. 격리 DB를 지정한 `npm run test:e2e -- e2e/ai.spec.ts --retries=0`는 로그인 보호·키 미설정·모의 AI 답변·여러 턴·자료 첨부·화면 이동·초기화·실패 재시도를 검증하며 실제 NVIDIA 호출 성공을 뜻하지 않습니다. E2E에서는 공용 NVIDIA 키를 빈 값으로 덮어 실제 호출을 막습니다.

## Riot 영구 키
24시간마다 만료되는 개발 키 대신 Personal Product Key를 신청하는 방법은 [RIOT_PRODUCT_KEY_GUIDE.md](RIOT_PRODUCT_KEY_GUIDE.md)를 참고하세요.

### Steam 크루픽과 도전 과제

추천 기준의 **요즘 크루픽 (최근 2주)**는 `GetRecentlyPlayedGames`의 실제 최근 플레이 인원과 시간을 반영한다. 확인할 수 없는 멤버는 따로 표시하고, 확인된 최근 후보가 없으면 누적 플레이 추천으로 대체하지 않는다. 전원 미보유 범위에는 기존 Steam 인기·신규 후보 순서를 적용한다.

**오늘의 게임 뽑기**는 검색 필터까지 적용된 추천 결과에서 균등하게 선택한다. 후보가 둘 이상이면 직전 게임을 제외한다. 멤버·기준·범위·검색어를 바꾸면 결과를 초기화한다.

**같이 도전 찾기**는 등록된 2~20명이 모두 보유한 한 게임에 대해 `GetSchemaForGame`과 `GetPlayerAchievements`를 조회한다. 숨겨진 과제는 제외하고, 전원의 공개 진행도가 확인된 과제만 팀 첫 도전 또는 따라잡기로 제안한다. 일부 진행도 실패는 미달성으로 추측하지 않는다. 과제별 누락 기록은 미확인 개수로 표시하고, 전원 달성 과제는 추천에서 제외한다. 협동 달성 가능 여부나 난이도는 추정하지 않는다. 진행도 요청은 최대 4개 병렬이며 목표는 최대 12개다.

Steam API 키는 서버에서만 사용한다. 보유·최근 기록 캐시는 5분, 과제 정의는 24시간, 개인 도전 진행도는 15분이다. 실패한 진행도 응답은 캐시하지 않는다. `/api/steam/missions`는 기존 로그인 인증을 사용하고 등록 여부·게임 보유 여부를 서버에서 다시 확인한다.

## 발견 기능의 현재 범위

- 완료된 최신 보관 주의 칭호는 칭호별 최소 기록을 확인합니다. 새벽 칭호는 실제 새벽 2~6시 메시지 수이며 온라인 여부를 뜻하지 않습니다.
- 개념글은 반응 3개·답글 2개 이상이면서 합계 8개 이상인 기록만, 합계가 높은 순서로 선별합니다.
- 대화 구간은 10분에 30개·4명 이상이어야 합니다. 같은 채널의 직전 7일 동안 3명 이상이 참여한 구간 최소 6개의 중앙값과 비교해 2배 이상인 구간만 선별합니다. 비교 표본과 참여자 정보가 부족하면 제외합니다. 메시지 본문·사건 내용이나 감정을 추측하지 않습니다.
- 재순이가 카드별 질문으로 발견을 소개하고 공개 후 짧은 응답으로 흐름을 이어갑니다. 결과 공개 시 연결된 실제 멤버 아바타 또는 이름 첫 글자, 기록과 비교 그래픽을 표시하며 반응·공유와 강조된 다음 발견 버튼이 나타납니다. `요즘 우리`에는 선별된 실제 기록만 보여줍니다.
- `GET /api/discovery/reaction?cardId=…`, `PUT /api/discovery/reaction`은 기존 로그인 인증을 사용합니다. PUT은 동일 출처·입력·원문의 존재를 검증하고 멤버당 한 반응을 저장합니다. 원하는 상태를 보내는 방식이라 재시도해도 중복되지 않습니다. 운영 반영 전 기존 마이그레이션 실행 경로로 **`0016_discovery_reactions.sql`**을 적용해야 합니다. 기존 로그인·수집 테이블, 환경변수는 변경하지 않습니다.
- 공유는 사용자가 직접 기기의 공유 창을 열거나 내용을 복사합니다. `/?discovery=…`는 로그인한 친구에게 해당 카드를 열어줍니다. 현재 목록에 없으면 이를 알리고 최근 발견을 보여줍니다. 다른 서비스에 자동 메시지를 보내지 않습니다.
- 추억 작성·영구 보관·Rewind·개인화는 후속 범위입니다. 게임 표지는 편집자의 제안이며 멤버의 실제 플레이 기록이 아닙니다.

검증과 화면 확인 근거는 [발견 QA 기록](docs/discovery-qa.md)을 참고하세요.

## 자동 운영 보호 설정

앱 환경변수와 분리해 다음 이름을 운영 실행기에 등록합니다. 비밀값은 코드·대화에 넣지 않습니다. 초기 연결 및 활성화 절차는 [OPERATIONS.md](OPERATIONS.md#자동-운영-보호-활성화)를 따릅니다.

| 이름 | 등록 위치 | 용도 |
|---|---|---|
| `CRON_SECRET` | Cloudflare Worker Secret | 기존 Vercel·GitHub 값과 같은 크론 인증 |
| `OPS_ALERT_WEBHOOK_URL` | Cloudflare Worker Secret | 앱/Actions가 실패해도 개입 필요 알림 |
| `VERCEL_TOKEN` | GitHub Actions Secret | 고정된 프로젝트 배포 조회 및 승인된 정책의 롤백·재승격. 프로젝트/팀 접근이 필요함 |
| `NEON_API_KEY` | GitHub Actions Secret | 재망호 프로젝트의 연산·전송 사용량 조회. 앱·Worker에는 전달하지 않음. 첫 성공 전에는 실제 보호 검증 미완료 |
| `BACKUP_DATABASE_URL` | GitHub Actions Secret | 백업 전용 계정의 직접 DB 연결 주소. SELECT 권한으로 전체 테이블을 읽을 수 있어야 함 |
| `BACKUP_ENCRYPTION_KEY` | GitHub Actions Secret | 무작위 32바이트의 canonical base64 AES-256-GCM 키. 백업과 별도로 안전하게 보관 |
| `OPS_AUTO_ROLLBACK` | GitHub Actions Variable | `1`일 때 안전 조건을 통과한 이전 버전으로 자동 롤백. 기본은 비활성 |
| `OPS_BACKUP_ENABLED` | GitHub Actions Variable·Worker Variable | `1`일 때 운영 백업·보관 파일 복원 검증 예약 활성화. 기본은 비활성 |

`BACKUP_OUTPUT_DIRECTORY`는 백업 CLI의 출력 디렉터리 선택용 로컬 설정이며 서비스 환경에 등록할 필요가 없습니다. `TEST_DATABASE_URL`은 기존 설정을 쓰되 백업 워크플로가 만든 로컬 PostgreSQL에만 연결합니다. 운영 DB 복원·유료 전환·권한 변경·암호화 키 교체는 사람이 결정합니다.
