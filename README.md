# ⚓ 재망호 (Jaemangho)

리그 오브 레전드 소환사들의 솔로 랭크 티어, 최근 전적, 실시간 게임 상태, 챔피언 숙련도, 듀오 시너지를 한곳에서 보는 크루 전용 대시보드입니다. UI는 친구들의 서브컬처 아지트를 위한 재망호 다크 디자인([DESIGN.md](DESIGN.md))을 따릅니다.

## 기능
- **대시보드** (`/lol`): 등록된 소환사별 티어/LP/승률, 최근 전적, 실시간 게임(관전) 상태
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
- **새 주제(롤, Steam 같은 큰 단위)를 추가하는 법**: ① `src/features/<이름>/`에 기능과 `index.ts`(화면, 홈 카드용 `<이름>HomeSummary`) 만들기 ② `src/components/nav.tsx`에 상세 메뉴와 `sectionsFor`/`sectionOf` 한 줄씩 ③ `src/app/(app)/<주소>/page.tsx` ④ `src/app/(app)/home.tsx`에 `HomeCard` 하나 추가. 서버 로직은 `src/server/<이름>/`, API는 `/api/<이름>/...`.
- API URL(`/api/riot`, `/api/members`)과 DB 테이블 이름은 아직 롤 기준입니다. 두 번째 카테고리가 생길 때 `/api/<카테고리>/...`로 나눕니다.

## 디스코드 연결 자동 연동
로그인할 때 디스코드 권한 `connections`로 사용자가 **디스코드에 연결해 둔 앱을 모두 훑어**, 우리 주제에 맞는 종류는 그 사용자의 멤버 계정으로 자동으로 묶습니다(`src/server/discord-connections.ts`). 지금은 Steam(`steam`)과 롤(`riotgames`, `leagueoflegends`)을 가져옵니다.
- 이미 등록된 계정이면 **주인이 비어 있을 때만** 주인으로 지정하고(다른 사람의 계정을 가로채지 않음), 없으면 새로 등록합니다. Steam의 이름과 아바타는 Steam에서 받고, `STEAM_API_KEY`가 없거나 실패하면 연결에 적힌 이름을 씁니다.
- 연결 목록을 못 읽거나 처리가 실패해도 **로그인은 항상 성공**합니다. 한 처리기가 실패해도 다른 처리기는 계속합니다. 연결 목록은 저장하지 않고 위 처리에만 씁니다.
- 연결 목록 조회 완료와 Steam·롤 계정 등록은 로그인 응답을 기다리게 하지 않습니다. 세션과 권한을 먼저 반영하고 Next.js `after`에서 연결을 마칩니다. 첫 화면에는 자동 연결이 아직 보이지 않을 수 있으며 완료 후 새로고침하면 반영됩니다. 실패한 연결은 다음 로그인에서 다시 시도합니다.
- 이 권한이 추가되기 전에 로그인한 사용자는 **다시 로그인**해야 적용됩니다(디스코드 동의 화면에 "연결된 계정 보기"가 추가로 표시됨).
- 서버 로그에 로그인마다 `discord connection types: …; unhandled: …`가 남습니다(계정 이름·id는 남기지 않고 **종류 이름만**). 공식 문서의 서비스 목록에 Riot이 없어서 실제로 어떤 종류로 오는지 이 줄로 확인하고, `unhandled`에 나온 종류는 아직 처리기가 없는 것입니다.
- **새 주제의 연결을 추가하려면**: `src/server/<이름>/connection.ts`에 `ConnectionHandler`(`types`, `link`)를 만들고 `discord-connections.ts`의 `HANDLERS`에 한 줄 더합니다.

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
위 채팅 집계를 바탕으로 사이트에 쌓이는 것들입니다. 상단 메뉴 **커뮤**에 있습니다. 반응(이모지)을 적게 쓰는 방이라, 반응에만 기대지 않고 **답글**과 **메시지가 몰린 정도**를 함께 씁니다.
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
| `SESSION_SECRET` | 로그인 비밀키(세션 서명용) 랜덤 문자열, 32자 이상 (`openssl rand -base64 32`) |
| `STEAM_API_KEY` | (선택) Steam Web API 키. 없으면 Steam 기능은 503을 돌려줍니다. 32자리 16진수. |
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

## E2E 테스트
실제 브라우저(Chromium)로 로그인 보호, 소환사 추가·삭제, 관리자 차단 흐름을 시험합니다 (`e2e/`).
```bash
npx playwright install chromium          # 처음 한 번
TEST_DATABASE_URL=postgres://... npm run test:e2e
```
- 운영과 같은 방식(마이그레이션 -> `next build` -> `next start`)으로 서버를 띄웁니다. `3200` 포트가 이미 쓰이고 있으면(개발 서버 등) 재사용하지 않고 멈춥니다. 먼저 그 서버를 끄세요.
- 디스코드 로그인은 외부 서비스라 쓰지 않습니다. DB에 사용자·세션을 만들고 로그인 라이브러리와 같은 방식으로 서명한 세션 쿠키를 브라우저에 넣습니다. Riot 응답은 브라우저의 `/api/riot` 요청을 가짜로 대체합니다(서버 프록시는 단위 테스트가 다룹니다).
- 테스트가 만드는 데이터는 `e2e_` 접두사로 시작하고 끝나면 지웁니다. 개발 DB가 아닌 별도 DB를 쓰세요.
- 실패하면 `test-results/`에 스크린샷과 트레이스가 남습니다 (`npx playwright show-trace <trace.zip>`). CI에서는 실패 시 리포트를 아티팩트로 올립니다.

## 배포
`main` 브랜치에 머지하면 Vercel이 자동 배포합니다. 환경변수를 바꾼 뒤에는 **재배포**해야 반영됩니다. `main` 이외 브랜치는 빌드하지 않습니다(`vercel.json`의 `ignoreCommand`).

## Riot 영구 키
24시간마다 만료되는 개발 키 대신 Personal Product Key를 신청하는 방법은 [RIOT_PRODUCT_KEY_GUIDE.md](RIOT_PRODUCT_KEY_GUIDE.md)를 참고하세요.

### Steam 크루픽과 도전 과제

추천 기준의 **요즘 크루픽 (최근 2주)**는 `GetRecentlyPlayedGames`의 실제 최근 플레이 인원과 시간을 반영한다. 확인할 수 없는 멤버는 따로 표시하고, 확인된 최근 후보가 없으면 누적 플레이 추천으로 대체하지 않는다. 전원 미보유 범위에는 기존 Steam 인기·신규 후보 순서를 적용한다.

**오늘의 게임 뽑기**는 검색 필터까지 적용된 추천 결과에서 균등하게 선택한다. 후보가 둘 이상이면 직전 게임을 제외한다. 멤버·기준·범위·검색어를 바꾸면 결과를 초기화한다.

**같이 도전 찾기**는 등록된 2~20명이 모두 보유한 한 게임에 대해 `GetSchemaForGame`과 `GetPlayerAchievements`를 조회한다. 숨겨진 과제는 제외하고, 전원의 공개 진행도가 확인된 과제만 팀 첫 도전 또는 따라잡기로 제안한다. 일부 진행도 실패는 미달성으로 추측하지 않는다. 과제별 누락 기록은 미확인 개수로 표시하고, 전원 달성 과제는 추천에서 제외한다. 협동 달성 가능 여부나 난이도는 추정하지 않는다. 진행도 요청은 최대 4개 병렬이며 목표는 최대 12개다.

Steam API 키는 서버에서만 사용한다. 보유·최근 기록 캐시는 5분, 과제 정의는 24시간, 개인 도전 진행도는 15분이다. 실패한 진행도 응답은 캐시하지 않는다. `/api/steam/missions`는 기존 로그인 인증을 사용하고 등록 여부·게임 보유 여부를 서버에서 다시 확인한다.
