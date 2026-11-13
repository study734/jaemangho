# ⚓ 재망호 (Jaemangho)

친구들과 게임을 고르고, 흥미로운 순간을 발견하고, 함께한 기록을 돌아보는 크루 전용 게임 커뮤니티입니다. UI는 친구들의 서브컬처 아지트를 위한 재망호 다크 디자인([DESIGN.md](DESIGN.md))을 따릅니다.

개발은 코딩 에이전트만 수행합니다. 설계·구현·문서·도구·검증은 이 전제를 따르며, 구체적인 작업 기준은 [AGENTS.md](AGENTS.md)에 둡니다.

## 개발 우선순위

1순위는 서버 API(`src/server`)와 디스코드 interactions(`src/server/discord-interactions`), 2순위는 웹 화면입니다(2026-11 결정). 새 기능은 서버 서비스와 디스코드 명령으로 먼저 제공하고 웹 UI는 후속으로 다룹니다. 웹 화면 변경은 버그·보안 수정, 기존 흐름 유지, 디스코드에 맞지 않는 흐름(로그인, Steam 연결·동의·취향 설정, 소환사·Steam 멤버 관리, 관리자 화면)으로 한정합니다. 디스코드에서 제공하는 웹 기능은 아래 [디스코드 명령](#디스코드-명령) 절에 있습니다.

## 기능
홈과 Steam·롤·기록 채널의 제공 기능은 재순이의 메시지와 임베드로 표시하며, 기존 입력·조회·검색·결과 동작을 그대로 사용할 수 있습니다.
- **오늘의 발견** (`/`): 완료된 주의 칭호·반응과 답글이 모인 개념글·평소보다 뚜렷하게 활발했던 대화 구간에서 최대 4개를 선별합니다. 칭호와 실제 인물·아바타·기록을 중심으로 결과를 공개하고, 반응을 저장·취소하거나 친구에게 공유할 수 있습니다. 같은 원문은 한 번만, 종류는 번갈아 보여주며 Steam 게임 뽑기 제안에서 목록이 끝납니다. 선별 기준을 통과한 기록이 없으면 사건을 꾸미지 않습니다. 출처별 성공 응답은 60초 캐시하고 같은 요청의 조회를 공유하며 구역별로 로딩합니다.
- **같이 놀기** (`/play`), **우리 기록** (`/memories`): 기존 Steam·LoL·개념글·시상식·멤버 프로필로 연결하는 허브입니다. 홈은 재순이가 있는 게임 로비형 화면이고, 모든 화면 위의 상단 바(홈·Steam·롤·우리 기록·멤버)와 왼쪽 하위 메뉴로 탐색합니다. 홈 아래에는 게임 찾기·기록·멤버 활동 패널이 이어집니다. 모바일은 하단 네 탭을 사용하며 게임별 상세 메뉴와 기존 주소를 유지합니다.
- **대시보드** (`/lol`): 등록된 소환사별 티어/LP/승률, 최근 전적, 실시간 게임(관전) 상태
- **디스코드 서버 위젯** (`/`): 홈 오른쪽 멤버 활동 패널 맨 위에 서버 `742002842453409792`의 공식 다크 위젯을 표시합니다. 1024px 이하에서는 본문 뒤의 활동 영역으로 이어집니다. 기본 크기는 350×500px이며 패널·화면 너비에 맞게 줄입니다. 서버 HTML에는 같은 높이의 자리를 확보하고 hydration 이후 iframe을 생성해 HTML 필터의 iframe 제거로 생기는 React 불일치를 방지합니다. 화면에 가까워질 때 로드하고 `no-referrer`로 사이트 출처를 보내지 않으며, 사이트 집계와 별도로 Discord에서 내용을 제공합니다. 서버 설정의 위젯이 활성화되어 있어야 하며, 표시되지 않으면 아래 서버 링크로 이동할 수 있습니다.
- **소환사 관리** (`/lol/squad`): 보고 싶은 소환사를 검색해 목록에 추가, 수정, 삭제 (로그인한 모두가 함께 보는 공용 목록)
- **듀오 시너지 분석** (`/lol/synergy`), **챔피언 숙련도** (`/lol/mastery`), **설정** (`/lol/settings`, Riot 연결 확인)
- **Steam 공통 협동 게임 추천** (`/steam`): 2~20명을 선택하고 **모두 보유 / 일부 보유 포함 / 아무도 미보유** 범위를 고릅니다. 보유·누적·최근 플레이와 동의 후 저장한 관측 증가분, 공통 추천 반영에 동의한 멤버의 게임 취향을 함께 사용합니다. 경험 기준 상위 40개(전원 미보유는 Steam 인기·신규 목록의 앞 40개)를 재정렬해 온라인 협동 지원을 확인한 최대 12개를 추천합니다. 확인 카탈로그에 인원이 있으면 선택한 인원에 맞는 온라인 모드도 확인하며, 그 외 게임의 최대 인원은 스토어에서 직접 확인합니다. 한 명이라도 보유 목록을 확인할 수 없으면 추천을 보류하고 최근 기록·게임 특성·지원 정보 실패를 구분합니다. 무료·패스·구매 조건은 스토어에서 확인합니다. 취향 원문은 다른 멤버에게 반환하지 않습니다.
- **Steam 협동 게임 세일** (`/steam`): 선택한 멤버 중 아직 없는 사람이 있는 확인된 협동 게임의 한국 스토어 가격과 세일 여부, 모두 구매할 때의 합계를 세일 순으로 보여줍니다. 아래 Steam 협동 게임 세일 절 참고.
- **패치노트**: 웹에 추가된 기능은 `/updates`(설정 메뉴 아래), 디스코드 봇·명령에 추가된 기능은 디스코드 `/패치노트`(본인에게만 표시)에서 최신순으로 봅니다. 새 기능을 배포할 때 `src/lib/patch-notes.ts` 맨 위에 `area: 'web' | 'discord'` 항목을 추가합니다(사용자에게 보이는 변화만, 양쪽에 걸치면 각각). 디스코드 쪽은 `/패치노트`가 처음이면 `npm run discord:register -- --apply`(사전 확인 후)로 명령을 등록해야 합니다.
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
- 서버 함수는 Neon 저장소와 같은 `iad1`에서 실행합니다(`vercel.json`의 `regions`). 페이지 하나가 DB를 여러 번 왕복하므로 함수를 DB 옆에 두는 Vercel 권장 배치를 따릅니다. DB 리전을 옮기면 이 값도 함께 바꿉니다.
- DB 연결 풀(`src/server/pool.ts`)은 Fluid compute(`vercel.json`의 `fluid: true`) 전제로 `attachDatabasePool`을 써서 인스턴스 정지 전에 유휴 연결을 정리하고, 응답 없는 쿼리는 `query_timeout`(30초) 뒤 연결째 버립니다. 새 연결이 시간 초과되면(Neon 절전 해제 지연, 인스턴스 정지 후 재개) 한 번만 다시 연결하고, 풀이 가득 차 대기하다 시간 초과된 경우는 다시 시도하지 않습니다. 운영 로그의 `database.connect` ETIMEDOUT은 연결 대기 초과, `database.query` ETIMEDOUT은 쿼리 응답 초과입니다.
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

## 디스코드 출처 찾기 (메시지 우클릭 명령)

채팅의 이미지·영상 메시지를 우클릭 → 앱 → **출처 찾기**를 누르면 작품명·화수·장면 시각·일치도를 본인에게만 보여줍니다(애니 장면 한정). 기존 `/게임추천`과 같은 서버 제한·계정·차단 확인·지연 응답을 씁니다. 구현은 `src/server/discord-interactions/source.ts`.

- [trace.moe](https://soruly.github.io/trace.moe-api/) 공개 API를 키 없이 URL로 조회합니다(새 환경변수 없음). 눌린 메시지의 첫 이미지·영상 첨부 URL만 보내며 Discord CDN 호스트가 아니면 요청 자체를 거부합니다. 임베드·링크 미리보기는 조회하지 않습니다.
- 게스트 한도는 IP당 `quota` 100, 동시 1건으로 실측했습니다(2026-10-17, 로컬 IP). 한도·동시 초과(402/429)는 안내만 하고 재시도하지 않습니다. 약관의 상업 조건은 공식 문서에 없어 친구들끼리 쓰는 비상업 용도로만 사용합니다. 근거와 미확인 항목은 [docs/meme-source-lookup-research.md](docs/meme-source-lookup-research.md).
- 한국어 제목은 제공되지 않아 일본어 원제(로마자)로 표시합니다. 일러스트 출처(SauceNao 등)는 약관을 확인하지 못해 포함하지 않았습니다.
- 운영에서는 `npm run discord:register -- --apply`로 명령을 등록해야 메뉴에 나타납니다(사전 확인 후).

## 디스코드 명령

웹 기능 중 디스코드 메시지로 옮길 수 있는 것은 슬래시 명령으로 제공합니다. 모든 답은 본인에게만 보이며(ephemeral) 계산은 웹과 같은 `src/server` 서비스를 씁니다. 로그인, Steam 연결·동의·취향 설정, 소환사·Steam 멤버 관리, 관리자 화면처럼 디스코드에 맞지 않는 흐름은 사이트 링크로 안내합니다.

| 명령 | 웹 기능 | 구현 |
|---|---|---|
| `/게임추천 [범위] [기준]` → 결과 버튼 `다른 추천`·`하나 뽑기`·`세일`·`같이 도전`·`모두 가진 게임`, `추천 기준 바꾸기` | `/steam` 공통 추천·오늘의 게임 뽑기·협동 게임 세일·같이 도전 찾기·공통 게임 비교 | `games.ts`, `party.ts` |
| `/기록` (시상식·개념글·뜨거웠던 순간을 한 메시지로) | `/community`, `/community/awards` | `records.ts` |
| `/멤버 [대상]` | `/people/<id>` (연결 계정·롤 랭크·Steam 최다 플레이 게임·칭호) | `records.ts`, `src/server/lol/stats.ts`의 `summonerRank` |
| `/전적 [닉네임]` | `/lol` 랭크·최근 경기·게임 중 여부 | `lol.ts`, `src/server/lol/stats.ts` |
| `/모집 [게임] [시간] [인원]` → 버튼 `참여`·`나가기`·`게임추천`·`마감` | (디스코드 전용) 같이 할 사람 모집, 모인 사람으로 `/steam` 공통 추천 | `lobby.ts` |
| `/개선` (관리자) | `/admin` 개선 우선순위 탭 | `admin.ts` |
| `/운영 상태·점검·동기화·캐시` (관리자) | `/admin` 운영 상태·운영 점검·채팅 동기화 재실행·Steam/Riot 캐시 비우기 | `admin.ts` |
| `/운영 시상식채널 [채널]`·`/운영 시상식게시` (관리자) | (디스코드 전용) 주간 시상식 자동 게시 켜기·끄기·지금 올리기 | `admin.ts`, `src/server/chat/award-post.ts` |
| `/패치노트`, `출처 찾기` | — | `handler.ts`, `source.ts` |

`/게임추천`은 AI 없이 기존 Steam 추천을 디스코드에서 실행합니다. 선택 옵션 `범위`는 **모두 보유**(기본), **일부 보유 포함**, **전원 미보유**이고, `기준`은 웹과 같은 **경험이 비슷한 게임**(기본)·**익숙한 게임**·**새로 해 볼 게임**·**요즘 크루픽 (최근 2주)**입니다(전원 미보유는 Steam 인기·신규 순서). 명령을 실행하면 본인에게만 친구 선택창이 나타나며, 함께할 서버 멤버 **2~20명**을 고르면 추천을 시작합니다. 본인도 참여하면 직접 선택해야 합니다. 결과는 최대 5개의 게임·지원 유형·스토어 링크를 보여줍니다. 선택창은 15분 후 만료되므로 `/게임추천`을 다시 실행합니다.

- **Steam 이용 동의**: 웹의 Steam API와 같이 요청자 본인의 현재 Steam 기능 동의(`hasSteamConsent`)가 있어야 선택창·결과·버튼을 처리합니다. 없으면 사이트 `/steam`으로 안내하고 계정·Steam 조회를 시작하지 않습니다. 저장한 취향은 기존대로 동의한 멤버의 것만 추천에 반영합니다.
- **결과 버튼과 파티**: 디스코드 `custom_id`는 100자라 친구 20명의 id를 담을 수 없습니다. 친구를 고르면 선택 interaction id로 `discord_parties`(`migrations/0024_discord_parties.sql`)에 디스코드 id·범위·기준만 저장하고 버튼에는 `party:<id>:<동작>`만 담습니다. 파티는 고른 사람만 쓸 수 있고 하루 뒤 만료되며 다음 저장 때 지워집니다. Steam 계정은 버튼을 누를 때마다 다시 확인해 연결 변경·차단을 즉시 반영합니다. 같은 선택이 재전송돼도 같은 파티를 씁니다. 버튼마다 새 비공개 메시지로 답하므로 앞선 결과는 남습니다.
- **다른 추천**은 같은 메시지를 그 자리에서 고쳐 다음 5개를 보여주고(최대 12개, 끝나면 처음으로), **추천 기준 바꾸기**는 파티의 기준을 바꿔 같은 메시지에서 다시 추천합니다(이후 뽑기·다른 추천도 바뀐 기준을 따름, 전원 미보유는 기준 없음). 두 동작은 새 메시지를 만들지 않습니다(첫 응답 type 6). 같은 멤버·기준이면 추천 순서가 같으므로, 다른 게임은 이 두 버튼으로 찾습니다. `/모집`의 `게임추천` 결과에도 같은 버튼이 붙습니다.
- 추천 결과 아래 **📣 이 게임으로 모집하기** 메뉴에서 보고 있는 게임을 고르면 그 게임 이름과 고른 친구 수를 정원으로 하는 `/모집` 공개 메시지를 그 채널에 올립니다(첫 응답 공개, 파티가 만료됐거나 다른 사람 것이면 공개 자리를 지우고 본인에게만 알림). 친구들은 직접 `참여`를 눌러 들어옵니다.
- 하루 안에 고른 친구 묶음이 있으면 친구 선택창에 **🔁 지난번 멤버로 (n명)** 버튼이 붙습니다. 이번 명령의 범위·기준으로 같은 친구들을 다시 추천합니다(친구 재선택 없음).
- 메시지 가독성: 게임·사이트 링크는 `[이름](<주소>)`로 써서 디스코드의 큰 링크 미리보기를 끄고, 제목(`###`)과 작은 글씨(`-#`) 줄로 이름과 근거를 나눕니다. 시상식은 칭호별 이모지·수상자(굵게)·근거(작은 글씨) 두 줄로, `/기록`과 자동 게시가 같은 모양(`award-post.ts`의 `awardLines`)을 씁니다.
- 예상하지 못한 오류는 `api/discord.interaction`으로 기록하고 사용자에게 **오류 ID**만 보여줍니다(서버 로그 `[failure]`에서 검색). 가입하지 않은 사용자에게는 사이트 로그인 링크를 보여줍니다. `/전적`의 소환사 목록은 요청자 본인 계정을 맨 앞에 `내 계정`으로 표시합니다.
- **하나 뽑기**는 같은 범위·기준의 추천 결과에서 균등하게 고르고 후보가 둘 이상이면 직전 게임(버튼에 담은 appId)을 뺍니다. **같이 도전**은 모두 가진 게임 중 함께 오래 한 순서로 최대 25개를 선택 메뉴로 보여준 뒤 공개 과제 진행도를 비교합니다. 세일·공통 게임·같이 도전 모두 한 명이라도 보유 목록을 읽을 수 없으면 추측하지 않고 멈춥니다.

**주간 시상식 자동 게시**는 관리자가 `/운영 시상식채널 채널:#채널`로 채널을 정해야 켜집니다(`discord_award_channel` 한 행, 비워서 실행하면 끔). 채팅 동기화가 지난주 칭호를 계산한 직후(`sync.ts`, 매일 새벽 크론 — 끝난 주는 월요일 새벽에 처음 계산) 기존 `DISCORD_BOT_TOKEN`으로 그 채널에 공개로 올립니다. `/운영 시상식게시`로 지금 올릴 수도 있습니다(같은 규칙).
- 주마다 한 번만 올립니다. `discord_award_posts`(`migrations/0026_discord_award_posts.sql`)에 먼저 `posting`으로 자리를 잡고 성공·실패를 남깁니다. 실패(`discord_http_403` 권한 없음, `discord_http_404` 채널 없음, 네트워크·시간 초과)는 다음 동기화가 다시 시도하고, 10분 넘게 `posting`에 멈춘 주만 다시 잡습니다. 실패는 동기화 결과를 바꾸지 않고 `app_failures`의 `chat.award-post`로 남습니다(관리자 개선 탭의 홈·우리 기록 영역). 응답 본문·토큰은 기록하지 않습니다.
- 공개 게시에서는 **눈팅러를 뺍니다**(사이트·`/기록`에는 남음). 눈팅러만 있는 주와 14일보다 오래된 주는 올리지 않습니다. 이름은 글자 그대로 쓰고 멘션 알림은 보내지 않습니다.
- 봇에 그 채널의 **채널 보기·메시지 보내기** 권한이 필요합니다(수집용 기본 권한은 보기·기록 읽기뿐). 공개 게시이므로 친구들에게 먼저 알리고 켭니다. 채널 지정·끄기·게시는 `ops_audit` 작업 이력에 남습니다.

**관리자 명령**(`/개선`, `/운영`)은 실행할 때마다 두 조건을 모두 확인합니다(`access.ts`의 `adminUser`). ① Discord가 서명해 보낸 현재 권한 `member.permissions`에 Administrator 비트(8)가 있을 것 ② 사이트의 기존 관리자 판정(로그인 때 서버 소유자·Administrator로 갱신되는 `role = 'admin'`)이 관리자이고 차단되지 않았을 것. 권한을 잃으면 재로그인 전이라도 ①에서 막히고, 사이트에 관리자로 로그인한 적이 없으면 ②에서 막힙니다. 명령 정의의 `default_member_permissions: "8"`은 메뉴 표시 기본값일 뿐이며 서버 설정에서 바뀔 수 있어 실행 조건으로 쓰지 않습니다. 상태를 바꾸는 작업(점검·동기화·캐시 비우기)은 웹과 같은 `ops_audit` 작업 이력에 남습니다. 수동 채팅 동기화는 디스코드 처리 예산(45초) 안에 끝나도록 30초에서 끊고, 남은 구간은 다음 실행이 이어 받습니다. 사용자 차단·해제와 소환사 삭제처럼 되돌리기 어려운 작업은 웹 관리자 화면에만 있습니다.

**`/모집`**은 명령을 실행한 채널에 **공개** 메시지를 올립니다(나머지 명령의 답은 본인에게만 보임). 모집 하나는 `discord_lobbies` 한 행(`migrations/0025_discord_lobbies.sql`)이고 버튼에는 모집 id만 담습니다.
- 연 사람이 첫 참여자입니다. `참여`·`나가기`·`마감`은 SQL 한 문장으로 조건(마감·정원·중복·연 사람)을 확인하며 바꾸므로 동시에 눌러도 정원을 넘거나 중복되지 않습니다. 연 사람은 나갈 수 없고 `마감`만 할 수 있으며, 마감하면 버튼이 사라집니다. 정원이 차면 `참여`만 비활성화됩니다. 24시간이 지나면 버튼이 동작하지 않고, 일주일 지난 행은 새 모집 때 지웁니다.
- 메시지는 버튼을 누른 사람의 interaction 토큰으로 고치므로 **봇 권한(메시지 보내기)이 필요 없습니다**. 동시에 누른 다른 사람의 수정이 늦게 도착해 옛 상태로 덮어쓰지 않도록, 고친 뒤 `version`이 바뀌었으면 최신 상태로 다시 고칩니다(최대 3번). 멘션은 표시만 하고 알림은 보내지 않습니다(`allowed_mentions: []`).
- 거절(정원 초과·이미 참여·마감됨 등)과 오류는 누른 사람에게만 보입니다. `/모집`이 가입·차단 확인에서 막히면 공개 자리를 지우고 본인에게만 알립니다. 첫 응답은 `/모집` 공개 지연 응답(type 5), 모집 버튼 메시지 수정(type 6), 그 밖은 비공개 지연 응답이며 `protocol.ts`의 `ackFor`가 정합니다.
- `게임추천`은 참여한 사람(2명 이상)을 그대로 친구 묶음으로 써서 `/게임추천`의 친구 선택 없이 추천하고, 결과와 후속 버튼은 누른 사람에게만 보여줍니다. Steam 동의 확인은 `/게임추천`과 같습니다.

`/기록`은 DB만 읽습니다. `/멤버`는 사이트 프로필과 같은 범위만 보여줍니다: 연결 계정, 롤 랭크(공용 대시보드와 같은 정보, 계정·랭크 Riot 호출 2번으로 웹과 캐시 공유), Steam 최다 플레이 게임 3개(사이트 프로필의 `topPlayed`, 5분 캐시), 칭호. 외부 호출을 줄이려고 종류별 최대 2개 계정만 조회하고 나머지는 사이트로 안내하며, 계정마다 실패를 따로 표시합니다(랭크 실패는 `profile.discord.rank`). 최근 2주 플레이처럼 사이트가 프로필에 보여주지 않는 정보는 쓰지 않습니다. `/기록`은 고르는 단계 없이 지난주 시상식·최근 개념글 5개·최근 8일의 뜨거웠던 순간 5개를 병렬로 조회해 한 메시지로 보여줍니다. 한 구역의 조회가 실패하면 그 구역만 '불러오지 못했어요'로 표시하고(빈 기록 안내와 구분, `chat.discord.*` 작업 이름으로 실패 기록) 나머지는 그대로 보여줍니다. 하위 명령이던 이전 정의로 온 요청도 받아 같은 결과를 줍니다. `/멤버`는 사이트에 가입한 차단되지 않은 멤버만 보여줍니다. `/전적`은 닉네임(`이름#태그`)을 받거나, 비우면 사이트의 공용 소환사 목록 중 최근 등록한 25명을 선택 메뉴로 보여줍니다(15분 만료, 발급자만). 서버에서 `proxyRiot`를 직접 써서 `/api/riot`과 같은 허용 경로·캐시·호출 통계를 공유하며 최근 경기 목록 캐시 키도 웹과 같습니다. 404는 없는 Riot ID, 401/403은 키 문제, 429는 호출 한도로 구분해 안내하고, 최근 경기·실시간 게임 실패는 랭크를 유지한 채 실패로 표시합니다.

- 지정한 `DISCORD_GUILD_ID` 서버에서만 받습니다. 요청자는 사이트에 디스코드로 가입한 차단되지 않은 사용자여야 하며, 명령과 선택 때마다 DB에서 다시 확인합니다. 웹 세션 쿠키를 대신 받아 쓰거나 사용자를 자동 가입시키지 않습니다.
- 선택한 친구마다 프로젝트의 디스코드 계정과 연결된 Steam 계정이 정확히 하나 있어야 합니다. 연결 없음·차단·여러 계정 연결은 안내하고 멈추며 이름으로 계정을 추측하지 않습니다. 공개 보유 목록 확인 실패·지원 정보 실패·후보 없음은 기존 추천 결과를 구분해 안내합니다.
- `POST /api/discord/interactions`는 선택 환경변수 **`DISCORD_PUBLIC_KEY`**(Discord Developer Portal → General Information → Public Key, 64자리 16진수)로 원문 바이트의 Ed25519 서명을 검증합니다. 서명 없음·위조·5분을 벗어난 타임스탬프는 401, 공개키 미설정은 503입니다. 서명된 PING에 PONG을 반환합니다. 이 키는 봇 토큰이나 Client Secret과 다릅니다.
- DB·Steam 조회 전에 비공개 지연 응답을 반환하고 Next.js `after`에서 결과를 전달합니다. 처리 예산은 45초, 라우트 최대 실행 시간은 60초입니다. 제한 초과 시 재시도 안내를 보내고 늦게 끝난 결과로 덮어쓰지 않습니다. 기존 공유 Steam 요청은 취소하지 않으며 별도 작업 큐·영구 재전송은 없습니다. Discord 답변 수정은 네트워크·5xx·1초 이내 429 대기와 404의 Unknown Message(10008)·Unknown Webhook(10015)에 한해 최대 3회 시도합니다. 최초 지연 응답이 Discord에 반영되기 전 후속 수정이 도착할 가능성에 대비해 해당 404는 250ms·500ms 후 재시도하며, 지속되는 무효 토큰은 같은 예산 안에서 실패합니다. 실패 로그에는 숫자 오류 코드·HTTP 상태만 남깁니다. 토큰·본문은 기록하지 않습니다.

운영 활성화는 배포·환경변수·Discord 앱 설정 변경에 대한 기존 사전 확인을 거친 뒤 진행합니다. 명령은 운영 배포 때 자동으로 등록되지만(4번), 아래 1~3번의 앱 설정이 없으면 디스코드가 요청을 보내지 않으므로 앱이 활성화되지는 않습니다.

1. 기존 Discord 로그인·수집과 **같은 앱**의 공개키를 `DISCORD_PUBLIC_KEY`에 설정하고 재배포합니다.
2. 해당 앱의 **Interactions Endpoint URL**을 `https://<도메인>/api/discord/interactions`로 설정합니다. 이 방식은 Gateway로 interactions를 받는 방식과 양립하지 않으므로, 기존 앱에서 다른 명령을 처리 중인지 먼저 확인합니다. REST 채팅 수집에는 영향을 주지 않습니다.
3. 앱의 서버 설치에 `applications.commands` scope가 포함돼 있는지 확인합니다. `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`은 같은 앱·서버의 기존 설정을 사용합니다. 상시 실행 봇이나 Message Content Intent는 필요하지 않습니다.
4. **명령 등록은 배포가 자동으로 합니다.** `vercel.json`의 `buildCommand`가 운영 빌드 성공 뒤 `node scripts/register-discord-command.mjs --deploy`를 실행해, Vercel 운영 환경의 기존 `DISCORD_CLIENT_ID`·`DISCORD_GUILD_ID`·`DISCORD_BOT_TOKEN`으로 `commands.json`의 명령을 지정 서버에 등록·갱신합니다. 토큰을 따로 입력하는 단계는 없습니다. `commands.json`을 바꾼 PR을 머지하면 그 운영 배포에서 반영됩니다.
   - 서버에 등록된 명령을 GET 한 번으로 읽어 **바뀐 명령만** 이름 기준으로 POST합니다. 바뀐 게 없으면 POST하지 않으므로 배포가 잦아도 Discord의 명령 생성 한도를 쓰지 않습니다. 정의에 없는 명령은 지우지 않습니다(bulk PUT 미사용).
   - `VERCEL_ENV=production`에서만 실행합니다. 미리보기·로컬 빌드는 건너뜁니다(`[discord] Skipping …` 로그).
   - 실패해도 배포를 막지 않습니다. 설정 누락·HTTP 상태·네트워크 오류는 빌드 로그에 `[discord] … Deployment continues`로 상태 코드만 남고, 명령은 이전 정의로 유지됩니다. 원인을 고친 뒤 재배포하면 다시 시도합니다. 401/403은 봇 토큰·앱 설치(`applications.commands`), 429는 잠시 뒤 재배포로 확인합니다.
   - 등록은 빌드 끝에서, 새 버전이 서비스되기 직전에 일어납니다. 새로 추가한 명령은 배포가 전환되기까지 짧은 동안 이전 버전이 400으로 거부할 수 있습니다.
   - 수동 실행도 같은 방식입니다: 미리보기 `npm run discord:register -- --dry-run`, 직접 등록 `npm run discord:register -- --apply`(로컬 `.env.local`에 같은 세 값 필요). 비교·실패 동작은 `scripts/register-discord-command.test.ts`로 재현합니다.
5. 디스코드에서 세 범위·기준, 결과 버튼, Steam 동의 없음, 계정 연결 없음, 비공개 목록, `/기록`·`/멤버`·`/전적`의 실제 답변 표시, `/모집`의 공개 게시와 동시 참여·마감, `/운영 시상식게시`의 채널 게시, 관리자 명령이 Administrator가 아닌 멤버에게서 거부되는지를 확인합니다. 마이그레이션은 같은 빌드의 시작에서, 명령 등록은 빌드 성공 뒤에 실행되므로 순서는 자동으로 지켜집니다. 운영에서 활성화하기 전까지 실제 Discord UI·콜드 스타트 응답 시간은 로컬 검증으로 대체할 수 없습니다.

구현은 `src/server/discord-interactions/`, 등록 정의는 같은 디렉터리의 `commands.json`(명령 배열)에 있습니다. 테스트: `npm test -- src/server/discord-interactions src/server/lol/stats.test.ts scripts/register-discord-command.test.ts`, 격리 DB의 계정 연결·파티 저장 검증(`access.integration.test.ts`, `party.integration.test.ts`)은 `TEST_DATABASE_URL`이 필요합니다. 등록 정의의 모든 명령·옵션이 서명 요청 스키마를 통과하는지도 `handler.test.ts`가 확인합니다. 서명된 실제 HTTP 요청은 `e2e/discord.spec.ts`로 확인하며, Discord 웹훅·Steam 응답은 단위 테스트의 fixture를 사용합니다. Node가 PATH에 없으면 위 명령 앞부분을 `rtk proxy bash scripts/agent-npm.sh`로 바꿉니다.

공식 규격: [Discord interactions](https://docs.discord.com/developers/interactions/receiving-and-responding), [사용자 선택 메뉴](https://docs.discord.com/developers/components/reference#user-select), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).

## 채팅 하이라이트 (홈의 명예의 전당·수다 통계)
디스코드 채널의 **메타데이터**(누가, 언제, 반응이 몇 개)만 집계해 홈에 보여줍니다. **글 내용은 읽지도 저장하지도 않습니다**(기본값): 봇에 메시지 내용 권한(MESSAGE_CONTENT)을 주지 않으면 디스코드가 내용을 빈 값으로 보내고, 우리는 그것을 쓰지 않습니다. 답글이 어느 메시지에 대한 것인지(`message_reference`)는 내용 권한 없이도 옵니다. 선택 기능인 웃음 분석을 켜면 이 설명이 아래 "웃음 분석"으로 바뀝니다.
- 이름에 `⛵`가 들어간 텍스트·공지 채널만 봅니다(`src/server/chat/sync.ts`의 `WATCH_MARK`).
- 하루 한 번 Vercel 크론(`vercel.json`)이 `GET /api/cron/chat`을 불러 최근 7일을 REST로 가져와 `chat_messages`에 저장합니다(반응 수는 변하므로 매번 갱신, 60일 지난 기록은 삭제). 이 경로는 로그인 세션이 아니라 `CRON_SECRET`(Bearer)으로 보호하며, 설정이 없으면 누구도 호출할 수 없습니다.
- 동기화가 전체 채널을 읽은 날에는 원본 삭제 전에 최근 60일의 날짜별 메시지·답글·반응·활동 작성자 **수**를 `discord_daily_activity`에 다시 계산해 남깁니다. 한국 시간 날짜만 저장하며 작성자·채널 식별자는 이 장기 집계에 넣지 않습니다. 부분 동기화 중에는 갱신하지 않고, 기록이 없는 날은 활동이 없었다고 단정하지 않습니다.
- Riot·Steam의 장기 활동 저장 구조(`migrations/0010_activity_facts.sql`)와 중복 방지 로직이 있습니다. Riot 수집의 활성화 조건은 [활동 데이터 수집 설계안](docs/activity-data-design.md)을 따릅니다. Steam은 아래 본인 확인·동의 후 방문 시 갱신 방식으로 연결했습니다.
- **Steam 데이터 이용 동의·기록 준비**: Steam 공통 게임 첫 진입 시 필수 동의 모달을 표시하고 동의 전에는 UI와 API 사용을 막습니다. Steam OpenID로 본인 확인을 마친 계정만 동의 후 기준 기록을 준비하고 방문 시 7일 간격으로 갱신합니다. 연결된 Neon 저장소 리전은 `iad1`(미국, 2026-10-16 확인)입니다. 현재 동작·철회·삭제와 검증은 아래 Steam 공통 추천 데이터와 필수 동의 절을 따릅니다. [Steam 활동 데이터 안내](/privacy/steam)는 공개 경로입니다.
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
- **개선 우선순위** (관리자 `개선` 탭, `GET /api/admin?resource=improvements`): 무엇을 고치거나 키울지 순서대로 보여줍니다. 최근 7일(한국 시간)의 활성 운영 경고, 서버 실패 횟수(`app_failures`), Riot 오류(404 제외, 401/403·429·5xx 구분), Steam 오류(`app_unavailable` 제외), 채팅 동기화 실패·부분 완료를 영역(롤·Steam·홈·우리 기록·멤버·운영·기타)별로 묶어 **고치기**로 먼저 보이고, 화면별 열람을 그 전 7일과 비교해 **살펴보기**(30% 이상 감소, 이전 10회 이상)·**키우기**(30% 이상 증가, 10회 이상)·**정리 검토**(2주 2회 이하)를 이어 보입니다. 두 주 열람 합계가 30회 미만이면 사용량 판단은 하지 않습니다. 규칙과 영역 대응(작업 이름 접두어)은 [improvements.ts](src/lib/improvements.ts), 회귀 검사는 `npm test -- src/lib/improvements.test.ts src/server/improvements.integration.test.ts src/server/failure-stats.test.ts`입니다. 새 기능의 `serverError`/`reportFailure` 작업 이름이 `AREAS`의 접두어에 맞지 않으면 `운영·기타`로 보이므로 함께 추가합니다.
- **서버 실패 횟수**: `reportFailure`는 로그와 함께 한국 시간 날짜·작업 이름·오류 분류(`code`)별 횟수만 `app_failures`에 더합니다(90일 보관). 사용자·요청·오류 원문은 저장하지 않습니다. 실패마다 쓰지 않고 인스턴스 안에서 모아 한 번에 하나의 쓰기만 실행합니다(한 요청의 연속 실패 21회 → 쓰기 1회, `failure-stats.test.ts`). 기록하는 요청은 이미 DB를 쓴 요청이라 절전 중인 Neon을 새로 깨우지 않습니다. `database.*` 실패는 세지 않고, 기록이 실패하면 60초 동안 기록을 멈추고 모은 횟수를 버려 DB 장애 중 연결을 더 쓰지 않습니다. 하루 50행씩 90일(4,500행)이 약 840 kB입니다(Neon Free 저장 0.5 GB). 개선 탭은 열 때와 `다시 계산`을 누를 때만 조회하고 폴링하지 않습니다. 구현은 [failure-stats.ts](src/server/failure-stats.ts)입니다.
- **운영 상태**: 장애·복구 알림, 채팅 동기화 기록/재실행, Steam 캐시·오류 통계, 관리자 작업 이력, 기간별 열람 비교와 운영 현황 내보내기. 자동 감시 설정·백업·격리 복구·장애 대응은 [OPERATIONS.md](OPERATIONS.md)를 참고하세요.
- 디스코드 서버 **소유자이거나 Administrator 권한**이 있는 사용자는 로그인 시 자동으로 관리자가 됩니다. 관리자를 추가하려면 디스코드에서 권한만 주면 됩니다(재로그인 필요).
- 환경변수가 비었거나 형식이 틀리면(예: 값 자리에 변수 이름을 그대로 넣은 경우) 관리자 탭 위쪽에 경고가 뜨고 서버 시작 로그에도 남습니다. 값은 표시하지 않습니다.
- 사이드바의 **관리자** 탭에서 접속자 목록과 차단/해제, 등록 소환사 삭제, 시스템 상태(Riot 캐시, DB 사용량, Riot 호출 통계, 최근 Riot 오류), 캐시 비우기를 합니다.
- 차단하면 그 사용자의 세션을 모두 지워 **즉시** 로그아웃되고, 로그인도 거부됩니다. 관리자는 차단할 수 없습니다.
- 관리자 여부와 접속 기록은 로그인할 때마다 디스코드 서버 권한을 기준으로 갱신됩니다.
- 디스코드의 관리자 명령 `/개선`, `/운영`은 이 관리자 여부와 실행 시점의 Discord Administrator 권한을 함께 확인합니다([디스코드 명령](#디스코드-명령) 참고).

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
| `DATABASE_URL` | Postgres 연결 문자열 (Vercel에서 Neon을 연결하면 자동 등록) |
| `DATABASE_URL_UNPOOLED` | (선택) 마이그레이션이 우선 사용하는 직접 연결 주소. Neon 연동이 자동 등록합니다. |
| `TEST_DATABASE_URL` | (선택) DB 통합 테스트용. 없으면 해당 테스트는 건너뜁니다. 개발 DB와 분리된 빈 DB를 쓰세요. |
| `DEV_LOGIN` | `1`이면 **개발 서버에서만** 디스코드 로그인 없이 관리자로 접속 (운영 빌드에서는 무시됨) |
| `GITHUB_ACTIONS_READ_TOKEN` | (선택) 관리자 화면의 자동 운영 보호(암호화 백업·복원 검증·배포 검사)와 Actions 보관 용량 조회용. 저장소가 비공개라 없으면 모두 `확인 불가`입니다. GitHub fine-grained 토큰을 이 저장소만, 권한은 **Actions: Read-only**만 주어 만들고 Vercel Production에 등록합니다(`github_pat_`로 시작). 만료 전에 교체하며, 만료·폐기되면 다시 `확인 불가`로 표시됩니다. 요청 헤더에만 쓰고 기록하지 않습니다. |
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

DB 요청 실패는 `[failure]`의 `database.connect`(연결·풀 대기)와 `database.query`(체크아웃한 연결의 쿼리 포함)로 추적합니다. 오류 ID·원본 SQLSTATE/네트워크 코드·`phase`·`elapsedMs`·풀의 전체/유휴/대기 수만 남기며 SQL·인자·연결 문자열·원본 오류 메시지는 기록하지 않습니다. Better Auth의 `Could not validate the database schema`만으로 마이그레이션 누락을 단정하지 말고 같은 시각의 DB 오류 코드를 확인합니다. 풀 연결 대기는 5초로 제한하고, 실패 뒤 다음 요청은 새로 연결할 수 있습니다. 구현과 회귀 검증은 `src/server/pool*`에 있습니다.

앱 풀과 마이그레이션은 기존 pg 8에서 인증서를 완전히 검증하던 `sslmode=prefer/require/verify-ca`를 `verify-full`로 명시해 향후 버전에서도 같은 검증 수준을 유지합니다(`src/server/postgres-url.mjs`). `uselibpqcompat=true`, SSL 비활성화·그 밖의 명시 설정은 바꾸지 않습니다. 연결 문자열 환경변수 자체는 수정하지 않습니다. 인증 기준 주소는 기존 `BETTER_AUTH_URL`이 있으면 사용하고, 없으면 `jaemangho.vercel.app`, `jaemangho.shop`, `www.jaemangho.shop`에서 요청별로 결정합니다. Vercel이 기본 제공하는 `VERCEL_URL`·`VERCEL_BRANCH_URL`의 정확한 현재 배포·브랜치 주소와 프로젝트의 고정 별칭도 허용합니다. 임의의 `*.vercel.app`은 허용하지 않습니다. 개발에서는 localhost/127.0.0.1의 포트도 허용하며, 운영 도메인을 추가할 때는 `src/server/auth-base-url.ts`의 허용 목록과 Discord 콜백 등록을 함께 확인합니다. 별도 환경변수 등록은 필요하지 않습니다.
- 예전 버전이 만들던 `users` 테이블(디스코드 ID 기반 접속 기록)은 `0002_drop_legacy_users.sql`에서 삭제됩니다. 되돌릴 수 없으므로(복원은 Neon 시점 복구뿐) 같은 이름의 현재 테이블 `"user"`(단수형)와 혼동하지 마세요.

## 로컬 개발
```bash
npm install
cp .env.example .env.local   # 값을 채웁니다 (없으면 아래 예시 참고)
npm run db:migrate            # 처음 한 번, 그리고 migrations/에 새 파일이 생길 때마다
npm run dev                   # http://localhost:3000
```
### Codex·Claude Code 공통 개발 환경변수 관리

**개발 준비는 어디서든 `npm run dev:prepare` 하나입니다.** 로컬에서는 아래 공용 사본을 `.env.local`로 복사하고(`sync`), 클라우드 세션에서는 컨테이너 안의 개발·테스트 DB와 `.env.local`을 만듭니다(아래 클라우드 세션 절). 이미 `.env.local`이 있으면 아무것도 바꾸지 않습니다. 외부 키가 없어도 앱은 `DEV_LOGIN=1`로 동작하고, 개발 서버는 환경변수 점검 경고를 출력하지 않습니다(운영 시작 때만). 키가 필요한 기능만 꺼진 상태가 됩니다. 아래 등록·설치·갱신 절차는 실제 Discord·Riot·Steam 연동을 로컬에서 쓰려 할 때만 필요합니다.

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

Claude Code에는 [`.claude/settings.json`](.claude/settings.json)의 `SessionStart` hook도 연결돼 있습니다. 공용 실행기가 설치되지 않은 곳(클라우드 세션 등)에서는 이 hook이 아무것도 하지 않고 끝나며, 클라우드 세션은 같은 hook의 두 번째 명령이 아래 클라우드 준비를 실행합니다. 프로젝트 설정을 포함한 브랜치에서 새 세션을 시작/재개하면 stdin의 `cwd`를 사용해 현재 worktree의 누락된 파일을 준비합니다. 실행기는 Git에서 공용 폴더를 조회하므로 `${CLAUDE_PROJECT_DIR}`가 출발 폴더를 계속 가리키더라도 복사 대상은 실제 worktree입니다. 다른 저장소에는 복사하지 않습니다. `--no-checkout`·hook 비활성화·아직 설치하지 않은 별도 clone에서는 자동 복사를 보장하지 않으며 다음 공통 명령으로 준비합니다. 별도 clone·새 컴퓨터는 최초 등록·설치를 다시 수행합니다.

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

### 클라우드 세션(Claude Code on the web)의 개발 준비

클라우드 세션에는 위의 로컬 공용 원본이 없으므로 `npm run dev:prepare`([`scripts/cloud-dev.sh`](scripts/cloud-dev.sh) `start`)가 컨테이너 안에서 준비합니다. 로컬 컴퓨터(`CLAUDE_CODE_REMOTE`가 `true`가 아님)에서는 공용 사본 `sync`만 하고, `setup` 모드는 아무것도 하지 않습니다.

- `setup`: 클라우드 환경 `jaemangho`의 setup script가 새 컨테이너마다 실행합니다. 컨테이너의 PostgreSQL로 `127.0.0.1:54329`에 개발 DB `jaemangho`와 테스트 DB `jaemangho_test`를 만들고(`trust` 인증, 컨테이너 밖에서 접속 불가), `npm ci`와 개발 DB 마이그레이션을 수행합니다. 마이그레이션은 `.env.local`의 주소가 아니라 이 로컬 개발 DB에만 적용합니다.
- `start`: DB를 켜고 DB를 만들기만 합니다(0.1~1초). 세션을 재개하면 데이터는 남지만 Postgres 프로세스가 꺼져 있으므로 [`.claude/settings.json`](.claude/settings.json)의 SessionStart hook이 클라우드 세션의 시작·재개마다 실행합니다. hook이 실행되지 않은 경우에는 `npm run dev:prepare`로 같은 준비를 합니다. 이미 켜져 있으면 바로 끝납니다.
- 두 모드 모두 `.env.local`이 없을 때만 로컬 DB 주소·무작위 `SESSION_SECRET`·`DEV_LOGIN=1`로 만듭니다(권한 600). 기존 파일과 DB는 덮어쓰지 않으며 값을 출력하지 않습니다. 외부 연동 키(Discord·Riot·Steam)는 비어 있으므로 해당 기능은 미준비 상태입니다.
- 환경 변수 `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/jaemangho_test`는 클라우드 환경 설정에 있어 `npm test`·`npm run test:e2e`가 그대로 DB 통합 테스트를 실행합니다.

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

## 재순이 대화 서비스 중단

2026-10-16에 결정한 NVIDIA 운영 사용 중단을 코드에 반영했습니다. NVIDIA 전송 코드·모델·API 키 검사·대화 에이전트·조회 도구·사용량 제한·대화용 취향 설정과 클라이언트 대화 상태를 제거했습니다. 환경에 기존 `NVIDIA_API_KEY`가 남아 있어도 앱에서 읽거나 외부 모델을 호출하지 않습니다. 다른 제공자로 자동 전환하거나 응답을 흉내 내지 않습니다.

`/chat`과 기존 탐색 링크에는 서비스 중단 안내, 재순이 그림, Steam 게임 찾기·롤 전적 링크만 남깁니다. 입력·전송·자료 첨부·취향 저장·질문 예시는 제공하지 않습니다. 게임·기록 화면의 대화 자료 전달 버튼도 제거했습니다. Steam 공통 추천·크루픽·도전 과제·취향 데이터 설정과 재순이의 정적인 기능 안내는 계속 동작합니다.

오래 열어 둔 탭을 위해 `POST /api/ai`, `GET/PUT /api/ai/settings`는 인증 후 `410`과 `code: ai_disabled`를 반환합니다. 미로그인은 401, 차단 사용자는 403을 유지합니다. 본문 처리·도구 조회·AI 취향 읽기/쓰기·외부 호출 없이 종료하며 정상적인 중단 상태를 서버 오류로 기록하지 않습니다. 기존 AI 전용 테이블과 적용된 마이그레이션은 변경하지 않습니다. 운영·공용 개발 환경의 키 자체를 삭제하는 것은 별도 설정 작업이며 이번 코드 변경으로 삭제하지 않습니다.

책임은 `src/server/ai-status.ts`(중단 응답), `src/app/api/ai/`(인증된 이전 API의 종료 응답), `src/features/ai/ChatRoom.tsx`(`/chat` 안내)에 있습니다. `npm test -- src/app/api/ai src/server/env.test.ts`와 격리 DB의 `npm run test:e2e -- e2e/ai.spec.ts --retries=0`으로 인증·410·기존 키 무시·화면별 무호출·이미지 실패·PC/1024px/모바일 안내를 검증합니다.

## Riot 영구 키
24시간마다 만료되는 개발 키 대신 Personal Product Key를 신청하는 방법은 [RIOT_PRODUCT_KEY_GUIDE.md](RIOT_PRODUCT_KEY_GUIDE.md)를 참고하세요.

### Steam 공통 추천 데이터와 필수 동의

Steam은 **공통 협동 게임 추천**(`/steam`) 하나로 제공합니다. 개인 맞춤 추천 메뉴·화면·API·AI 도구는 제거했으며 이전 `/steam/recommend` 주소는 `/steam`으로 이동합니다. 개인의 보유·누적·최근 기록과 저장한 취향은 함께할 멤버에게 맞는 협동 게임을 고르는 데이터입니다. 개인 추천 순위는 별도로 만들지 않습니다.

좌측 **Steam 공통 게임** 링크, 직접 주소, 홈에서 들어오는 경로 모두 처음에는 필수 동의 모달을 표시합니다. 동의 전에는 화면 본문을 마운트하거나 Steam 목록·비교 요청을 시작하지 않습니다. Escape·바깥 클릭으로 우회할 수 없으며, **동의하고 Steam 공통 게임 사용** 또는 **동의하지 않고 나가기**를 선택합니다. 저장 실패·동의 조회 실패 때도 기능을 열지 않습니다. 본인의 현재 안내 버전 동의를 `steam_feature_consents`에 저장합니다(`0020_steam_feature_consents.sql`). 기존 사용자의 동의를 추정하거나 자동으로 채우지 않습니다.

회원 목록·등록·수정·삭제, 게임 비교·추천·도전, 취향 조회·저장 API는 기존 로그인·차단 검사 후 현재 이용 동의를 확인합니다. 재순이의 Steam 조회 도구도 동의 전에 실행하지 않습니다. 동의와 관계없이 활동 기록의 중단·삭제 경로는 유지합니다. **내 추천 데이터·취향 설정 → Steam 기능 동의 철회**는 수집을 중단하고 취향·관측 증가분을 다음 공통 추천에서 제외합니다. 철회 후 기능을 다시 사용하려면 모달에서 새로 동의해야 합니다. 저장 기록은 자동 삭제하지 않으며 별도의 기록·취향 삭제로 지웁니다.

동의에는 공개 보유·플레이 데이터와 저장 취향의 공통 추천 이용, Steam OpenID로 본인 확인을 마친 계정의 기록 준비, 수집 항목·방문 시 갱신·보관·미국 저장을 명시합니다. 동의 직후 확인된 본인 계정만 첫 기준 기록을 응답 뒤 준비하고, 이후 방문 시 마지막 성공부터 7일이 지났으면 갱신합니다. 나중에 본인 계정을 확인한 경우에도 기존 이용 동의가 유지되고 최초 요청이 없으면 기록을 준비합니다. 수집을 직접 중단한 계정은 자동 재개하지 않습니다. 예약 작업은 추가하지 않았고 실패 재시도는 최소 15분 간격입니다. 표시용 `owner_id` 연결만으로 장기 수집을 켜지 않습니다.

**내 추천 데이터·취향 설정**에서 좋아함·피함 태그와 게임별 선호·제외를 저장 버튼으로만 `steam_tastes`에 저장합니다(`0019_steam_tastes.sql`). 현재 기능 동의가 유지되고 선택 계정의 현재 주인이 저장자와 같은 프로필만 공통 추천에 사용합니다. 취향 원문·사용자 대응표는 공개하지 않고 반영된 인원수와 집계된 근거만 반환합니다. 이전 `share`·`together`·`groupConsent` 스위치는 무시합니다. 재순이 대화용 개인 메모(`ai_preferences`)는 별개이며 추천 점수로 해석하지 않습니다. 새 채팅·새로고침 뒤에도 취향은 유지하고 전체 삭제로 지웁니다. 저장 전 입력은 추천에 반영하지 않고 실패·재시도·화면 이탈 후 늦은 응답을 구분합니다.

[`catalog.ts`](src/server/steam/catalog.ts)의 13개 확인 게임은 장르·플레이 방식의 세부 참고 데이터입니다. Hades·Balatro·Slay the Spire 같은 싱글플레이 선호도 비슷한 특성의 협동 게임을 찾는 입력으로 사용할 수 있으며, 해당 싱글플레이 게임을 공통 협동 결과로 반환하지 않습니다. 새 참고 게임은 공식 출처에서 태그·방식·인원을 확인하고 출처 URL·확인일을 남깁니다. 공통 후보는 선택한 보유 범위에서 최대 40개이며 전체 Steam 카탈로그 검색은 아닙니다.

확인한 게임 태그의 Jaccard 유사도, 로그로 제한한 누적 시간(20시간 상한), 최근 플레이와 동의 후 저장한 최근 30일 관측 증가분은 약한 신호입니다. 관측 구간의 시작·끝이 모두 최근 30일 안인 증가분만 사용하고 실제 플레이 시각이나 정확한 최근 2주 기록으로 해석하지 않습니다. 직접 제외한 게임은 필터, 피하는 장르는 감점입니다. 참여자별 적합도의 평균 60%와 최소값 40%를 합친 취향 점수 70%, 선택한 경험 기준 30%를 섞습니다. 근거가 없으면 기존 경험 기준을 사용하고 전원 미보유 후보는 원래 목록 순서와 점수 없음 상태를 유지합니다. 점수는 만족 확률이나 실력이 아닙니다.

추천은 NVIDIA 없이 서버에서 계산합니다. 공개 보유·최근 기록은 병렬 조회하며 기존 5분 캐시를 사용합니다. 후보 최대 40개와 참여자별로 번갈아 고른 출처 최대 24개, 선호 게임의 특성을 8개씩 조회하고 장르 캐시(24시간)·동일 요청 공유를 사용합니다. 전체 25초 예산이 지나면 다음 단계를 시작하거나 늦은 응답으로 덮지 않습니다. 실제 외부 지연 개선을 측정한 결과는 아니며 호출 상한과 동의 후 백그라운드 준비를 검증합니다.

책임은 `src/server/steam/consent.ts`(필수 동의·API 게이트), `tastes.ts`(취향 저장·동의된 데이터), `taste-ranking.ts`(참여자별 적합도), `group-ranking.ts`(공통 순위·조회 상한), `src/server/activity/steam-signals.ts`(관측 증가분), `src/features/steam/ConsentGate.tsx`(필수 모달), `tasteModel.ts`(취향 저장 상태)에 둡니다. `npm test -- src/server/steam src/features/steam src/server/activity src/app/api/steam/taste`와 격리 DB의 통합 테스트, `npm run test:e2e -- e2e/steam-activity.spec.ts e2e/steam-taste.spec.ts --retries=0`로 재현합니다. 기존 E2E의 `loginAs`는 합성 동의를 준비하며 모달 검증은 세 번째 인자를 `false`로 줍니다. E2E는 합성 Steam 키와 DB 캐시를 사용하므로 외부 Steam 성공이나 운영 반영을 뜻하지 않습니다.

### Steam 크루픽과 도전 과제

추천 기준의 **요즘 크루픽 (최근 2주)**는 `GetRecentlyPlayedGames`의 실제 최근 플레이 인원과 시간을 반영한다. 확인할 수 없는 멤버는 따로 표시하고, 확인된 최근 후보가 없으면 누적 플레이 추천으로 대체하지 않는다. 전원 미보유 범위에는 기존 Steam 인기·신규 후보 순서를 적용한다.

**오늘의 게임 뽑기**는 검색 필터까지 적용된 추천 결과에서 균등하게 선택한다. 후보가 둘 이상이면 직전 게임을 제외한다. 멤버·기준·범위·검색어를 바꾸면 결과를 초기화한다.

**같이 도전 찾기**는 등록된 2~20명이 모두 보유한 한 게임에 대해 `GetSchemaForGame`과 `GetPlayerAchievements`를 조회한다. 숨겨진 과제는 제외하고, 전원의 공개 진행도가 확인된 과제만 팀 첫 도전 또는 따라잡기로 제안한다. 일부 진행도 실패는 미달성으로 추측하지 않는다. 과제별 누락 기록은 미확인 개수로 표시하고, 전원 달성 과제는 추천에서 제외한다. 협동 달성 가능 여부나 난이도는 추정하지 않는다. 진행도 요청은 최대 4개 병렬이며 목표는 최대 12개다.

### Steam 협동 게임 세일

`/steam`의 **같이 사면 좋은 협동 게임**은 선택한 2~20명 중 한 명이라도 없는 협동 게임의 한국 스토어 가격을 세일 순으로 보여준다(`GET /api/steam/deals?ids=`, 기존 Steam 동의·로그인 게이트 사용). 대상은 인원 조건이 확인된 `src/server/steam/catalog.ts`의 온라인 협동 게임이며 선택 인원에 맞는 게임만 포함한다. 카탈로그 밖의 게임은 인원을 확인하지 못해 다루지 않으므로 게임을 늘리려면 근거와 함께 그 표에 추가한다. 가격은 스토어 `appdetails?filters=price_overview&cc=kr`를 한 번에 조회해 DB 캐시에 1시간 보관한다(`prices.ts`, 성공한 응답만 캐시). 한 명이라도 보유 목록을 읽을 수 없으면 누가 사야 하는지 알 수 없어 보류하고, 가격 조회만 실패하면 보유 현황은 보여주고 가격은 스토어 확인을 안내한다. 스토어에 가격 항목이 없는 게임은 가격 미표시이며 무료로 단정하지 않는다. Friend’s Pass 같은 구매 없는 참여 조건은 판단하지 않는다.

계산은 `deals.ts`의 `buildDeals`(순수 함수), 가격 조회는 `prices.ts`, 화면은 `DealsPanel.tsx`와 `dealsModel.ts`(요청 중복·오래된 응답 방어)에 있다. 재현: `npm test -- src/server/steam/prices.test.ts src/server/steam/deals.test.ts src/features/steam/dealsModel.test.ts`, 화면은 `npm run test:e2e -- e2e/steam.spec.ts --retries=0`(가격 응답은 가짜로 대체).

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
