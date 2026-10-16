# 디스코드 "출처 찾기" 메시지 명령 도입 조사

2026-10-17 조사. 채팅의 이미지 메시지를 우클릭 → 앱 → "출처 찾기"로 실행하면 나만 보이는 응답에 작품명·화수·장면 시각을 보여주는 기능을 현재 무료 인프라에 넣을 수 있는지 본다. 코드는 바꾸지 않았다. "미확인"은 1차 출처에서 확인하지 못했다는 뜻이며 사실이 아니라는 뜻이 아니다.

## 결론

- **판단: 조건부 도입 가능(애니 장면 한정).** 기존 `/게임추천`과 같은 구조(즉시 지연 응답 + `after()` 후속 수정)로 얹을 수 있고 함수 시간·호출 한도 문제는 없다. 일러스트(SauceNao)는 공식 한도를 확인하지 못해 보류한다.
- **가장 큰 병목: 외부 API(trace.moe) 무료 한도와 상업·약관의 불확실성.** 공식 문서에 게스트(IP 기준) 일일 한도의 실제 숫자와 상업 이용 조건이 없다. Vercel 함수 IP는 공유·유동이라 다른 사용자와 한도를 나눌 수 있고(추정), 한도 초과는 HTTP 402다.
- **남은 확인(사람이 해야 할 것)**
  1. `https://api.trace.moe/me`를 운영 환경에서 호출해 게스트 `quota`·`concurrency`를 실측한다(Vercel IP 기준이라 로컬 값과 다를 수 있음).
  2. trace.moe 사용 조건(상업 여부, 키 발급)은 운영자(soruly) 문의 또는 Discord 공지로 확인한다. 저장소 MIT 라이선스는 서버 코드에 대한 것이며 호스팅 서비스 이용 약관이 아니다.
  3. SauceNao는 로그인 후 API 페이지(`https://saucenao.com/user.php?page=search-api`)에서 무료 키의 일·30초 한도와 약관을 직접 확인한다(WebFetch 403, 로그인 필요로 추정).
  4. 이 프로젝트가 Vercel Hobby의 "비상업 개인 이용" 범위에 드는지는 운영자 판단이다.
  5. 새 명령 등록(`npm run discord:register`)과 앱 설정 변경은 AGENTS.md상 사람 확인 대상이다.
  6. 실제 Discord UI에서 우클릭 메뉴, CDN URL 만료, 콜드 스타트 응답 시간을 운영 전 실측한다.
- **최소 구현 윤곽**
  1. `command.json`에 이름 "출처 찾기", `type: 3`(설명 없음) 명령을 추가하고 등록 스크립트가 여러 명령을 다루게 한다(현재는 `/게임추천` 하나만 등록).
  2. `protocol.ts`의 `interactionSchema`에 `type: 2, data.type: 3`(`target_id`, `resolved.messages`)을 추가한다. 현재 type 2는 `name: '게임추천'`으로 고정이라 분기가 필요하다.
  3. `handler.ts`의 `processCommand`에서 type 3이면 `resolved.messages[target_id].attachments`의 첫 이미지 `url`을 골라 `https://api.trace.moe/search?anilistInfo&cutBorders=2&url=...`로 조회한다. 이미지가 없으면 안내 메시지를 낸다.
  4. 결과에서 유사도 0.9 미만은 "확실하지 않음"으로 표시하고 `title.native/romaji/english`, `episode`, `from`을 `mm:ss`로 보여준다. 응답은 기존 `privateMessage`와 `editReply`를 재사용한다.
  5. 사용자별 일일 호출 제한(DB)은 trace.moe 실제 한도를 `/me`로 확인한 뒤 필요할 때만 추가한다.

## 1. 외부 이미지 출처 API

### trace.moe (애니 장면)

출처: trace.moe API 문서 원문 `https://raw.githubusercontent.com/soruly/trace.moe-api/master/docs/docs.md` (게시 페이지 `https://soruly.github.io/trace.moe-api/`)

| 항목 | 확인 내용 |
| --- | --- |
| 키 | 불필요. 키 없이 검색하면 IP 기준 게스트. 더 큰 한도는 `x-trace-key` 헤더 키(docs.md "Using the API with API Keys"). 키 발급 조건은 미확인 |
| 한도 | 24시간 단위 `quota`/`quotaUsed`, 병렬 `concurrency`, 큐 `priority`가 있고 `GET /me`로 조회(docs.md "/me"). 문서 예시값은 100·1000이나 예시일 뿐이며 게스트 실제 숫자는 미확인. 분당 한도는 미확인 |
| 초과 시 | HTTP 402 "Search quota depleted / Concurrency limit exceeded". 503 큐 가득, 504 과부하(docs.md "Error codes") |
| 이미지 전달 | URL 전달(`?url=`), 본문 업로드(POST), multipart 모두 가능. 파일은 25 MB 이하(초과 413). 권장 해상도 640×360. 동영상·GIF는 첫 프레임만 사용(docs.md "Search Image Format") |
| 응답 | `anilist`(ID 또는 객체), `filename`, `episode`, `episode_start/end`, `from`/`at`/`to`(초), `similarity`(0~1), `image`/`video` 미리보기 URL. 0.9 미만은 오답 가능성이 높다고 명시 |
| 작품명 | 기본은 AniList ID만. `anilistInfo`를 붙이면 `idMal`, `title`(native/romaji/english), `synonyms`, `isAdult`를 포함하나 AniList 추가 조회로 느려지고 실패할 수 있다고 명시 |
| 한국어 제목 | 제공하지 않음. 문서는 중국어 번역 제목 프로젝트(anilist-chinese)만 언급한다. 한국어는 미확인(AniList 제목 필드에 한국어 없음). native/romaji/english 중 하나로 대체해야 한다 |
| 미리보기 URL | `image`/`video` URL은 300초 후 만료 |
| 응답 시간 | 문서에 수치 없음. `/stats?type=speed`로 지연 분포를 볼 수 있다고만 기재(비공식 엔드포인트). 실측 필요 |
| 약관 | 상업·비상업 조건 미확인. `https://trace.moe/faq`에도 한도·상업 조건 언급 없음. API 서버 저장소는 MIT |
| 부가 | `cutBorders=2`는 원본·잘라낸 이미지를 함께 검색하며 검은 테두리가 있으면 쿼터 2 소비. 스크린샷 캡처에 유용 |

### SauceNao (일러스트·만화)

- 공식 API 페이지(`https://saucenao.com/user.php?page=search-api`)는 이번 환경에서 403이라 열지 못했다. 공식 한도, 키 필요 여부, URL/업로드 방식, 상업 약관은 모두 **미확인**이다.
- 비공식 라이브러리(PyPI 문서)는 무료 계정을 "30초당 8회, 24시간 200회"로 적고 다른 라이브러리는 30초당 4/6/15회(미등록/기본/프리미엄)로 적어 서로 다르다. 근거로 쓰지 않는다. 키는 API 호출에 필요한 것으로 보이나 이 역시 공식 확인 전이다.

### 대안

- IQDB, ascii2d의 공식 API 제공 여부: 이번 조사에서 1차 출처를 확인하지 못해 **미확인**.
- 한국어 제목이 필요하면 AniList GraphQL을 별도 조회할 수 있으나 한국어 필드 제공은 미확인이다. AniList 한도는 공식 문서 기준 분당 90회이며 현재 장애로 분당 30회로 제한된 상태라고 적혀 있다(`https://github.com/AniList/ApiV2-GraphQL-Docs/blob/master/docs/guide/rate-limiting.md`, 초과 시 1분 차단). trace.moe의 `anilistInfo`가 이 조회를 대신하므로 직접 호출할 필요는 없다.

## 2. 디스코드

출처: `https://docs.discord.com/developers/interactions/application-commands`, `.../receiving-and-responding`, `.../resources/message`, `.../reference`

- **명령 종류**: 메시지 명령은 type 3. 이름 1~32자, 대소문자·공백 허용, 설명 없음. 인자 없이 대상 메시지를 받는다. 앱당 전역·길드 각각 15개.
- **등록 범위**: 길드 명령은 즉시 반영, 전역 명령은 반영 시간이 문서에 없어 미확인(문서는 길드 명령으로 테스트 후 전역 게시를 권장). 길드 명령은 DM에서 쓸 수 없다. 길드당 하루 신규 생성 200회 제한. 이 프로젝트는 단일 서버라 길드 등록이 맞다(현재 스크립트도 `DISCORD_GUILD_ID` 사용).
- **수신 데이터**: interaction `type` 2, `data.type` 3, `data.target_id`, `data.resolved.messages[id]`에 `content`, `attachments`, `embeds` 등 전체 메시지가 온다. 추가로 메시지를 읽는 봇 권한이나 Message Content Intent는 필요 없다고 보인다(채팅 수집용 봇 토큰과 별개).
- **첨부 객체**: `url`, `proxy_url`, `size`, `content_type`, `width`, `height`.
- **임베드 이미지**: 링크 미리보기 이미지는 `embeds`에 있으나 이번에 필드별로는 확인하지 않았다(미확인). 첫 구현은 첨부만 대상으로 한다.
- **3초 제한**: 최초 응답은 수신 후 3초 이내. 초과하면 토큰 무효.
- **지연 응답**: type 5, 이후 `PATCH /webhooks/{app}/{token}/messages/@original`로 수정. 나만 보이게 하려면 type 5 응답에서 `flags: 64`(EPHEMERAL). 지연 응답 이후 설정 가능한 플래그는 이것뿐이다.
- **토큰 유효**: 15분. 후속 메시지는 `POST /webhooks/{app}/{token}`.
- **CDN URL 서명**: 첨부 URL은 서명 URL이며 `ex`(만료), `is`(발급), `hm`(서명) 쿼리를 갖는다. 문서는 페이로드로 받은 URL은 유효한 것으로 본다고 하나 만료 시간 값은 문서에 없어 미확인. 우클릭 직후 받은 URL을 즉시 쓰므로 영향은 작다. URL의 쿼리를 제거하면 안 된다. 다만 오래된 메시지를 우클릭할 때 payload의 URL이 갱신된 URL인지는 실측이 필요하다(미확인).
- **이미지 크기**: 디스코드 업로드 한도는 이번에 확인하지 않았다(미확인). 외부 API 쪽 한도는 trace.moe 25 MB. 서버가 이미지를 내려받지 않고 URL만 넘기면 Vercel 4.5 MB 본문 제한도 피한다.

## 3. 이 저장소와 Vercel

### 플랜과 한도

- `docs/free-infrastructure.md`: Vercel 팀은 Hobby(2026-10-11 확인), 무료 한도는 월 함수 100만 호출·CPU 4시간·메모리 360 GB-hour·전송 100 GB. `vercel.json`에 `functions` 설정은 없고 크론 2개(`ops-watchdog`, `chat`)만 있다.
- Vercel 공식 문서 대조(`https://vercel.com/docs/functions/limitations`, 2026-08-24 갱신): Hobby 최대 실행 시간은 기본·최대 모두 300초(Fluid compute 기준), 메모리 2 GB, 요청·응답 본문 4.5 MB. `https://vercel.com/docs/limits/fair-use-guidelines`(2026-09-14)의 Hobby 포함량은 함수 호출 100만, Active CPU 4시간, 메모리 360 GB-hr로 `free-infrastructure.md`와 일치한다.
- 대기(I/O)는 Active CPU로 계산하지 않는다(limitations 문서 "Cost and usage"). trace.moe 응답을 기다리는 시간이 CPU 4시간을 소모하지는 않지만 프로비저닝 메모리 시간은 소비한다.
- 같은 문서에 Hobby는 비상업 개인 이용으로만 제한된다. 기부 요청은 상업에 해당하지 않는다고 명시.
- 라우트는 이미 `maxDuration = 60`이고 처리 예산은 45초(`src/app/api/discord/interactions/route.ts`, `src/server/discord-interactions/handler.ts:5`). 출처 검색 한 번은 이 안에 충분히 들어갈 것으로 추정한다(실측 전).

### 기존 구조

- `route.ts`: `receiveInteraction(request, work => after(work))`. Next.js `after`가 이미 쓰이고 있다.
- `handler.ts` `receiveInteraction`: 서명 검증 → JSON 검증 → PING(type 1) 응답 → 앱·길드 ID 확인 → `defer(() => completeInteraction(...))` 후 `{ type: 5, data: { flags: 64 } }` 즉시 반환. DB·외부 호출은 응답 전에 하지 않는다. 지연 응답 + 후속 수정이 이미 동작하는 구조다.
- `completeInteraction`: 45초 예산과 `Promise.race`로 시간 초과 안내를 보내고 `editReply`로 수정한다. `editReply`는 네트워크·5xx·1초 이내 429와 404(10008, 10015)를 최대 3회 재시도하고 토큰·본문은 로그에 남기지 않는다.
- `processCommand`: `canUseCommand`(가입·차단 확인) 뒤 type 2는 친구 선택, type 3은 선택 메뉴 처리로 가정하고 있다. **type 3이 "선택 메뉴 컴포넌트(`component_type: 5`)"를 뜻하는 기존 의미와 충돌**한다. 메시지 명령은 최상위 `type: 2`(APPLICATION_COMMAND), `data.type: 3`이므로 interaction 최상위 type 번호는 겹치지 않지만, `interactionSchema`의 type 2 분기가 `name: '게임추천'`·`data.type: 1`로 고정돼 새 스키마 분기가 필요하다. `processCommand`의 `interaction.type === 2` 분기에서도 명령 이름으로 갈라야 한다.
- `protocol.ts`의 `privateMessage`로 응답 메시지를 만들면 `allowed_mentions` 제한이 적용된다.
- `command.json`은 명령 하나의 정의이고 등록 스크립트(`npm run discord:register`, README "지정 서버의 `/게임추천` 하나만 POST로 등록·갱신")가 이 하나만 처리한다. 명령 추가 시 스크립트와 테스트(`scripts/register-discord-command.test.ts`) 수정이 필요하다(스크립트 본문은 이번에 읽지 않음, 미확인).
- 로그인·접근 제어 코드(`auth.ts`, `viewer.ts`, `discord.ts`)는 건드리지 않고 `canUseCommand`를 그대로 쓰면 된다. 환경변수 추가가 필요 없다면 사전 확인 대상(환경변수 변경)을 피할 수 있다. trace.moe 키를 쓰게 되면 새 환경변수가 필요하므로 그때는 사람 확인을 거친다.

### 판단

지연 응답과 `after()` 후속 처리는 현재 구조로 가능하다. 변경은 스키마 분기, 새 서비스 모듈(외부 조회·결과 포맷), 명령 등록 확장이며 로그인·DB 마이그레이션은 필요 없다. 모듈 경계상 `src/server/discord-interactions/`에 `sauce.ts`를 두고 `fetch`를 주입 가능하게 하면 `handler.test.ts`처럼 fixture로 검증할 수 있다. 위험은 코드가 아니라 외부 서비스의 한도·약관이다.

## 출처 목록

- trace.moe API: `https://raw.githubusercontent.com/soruly/trace.moe-api/master/docs/docs.md`
- Discord: `https://docs.discord.com/developers/interactions/application-commands`, `https://docs.discord.com/developers/interactions/receiving-and-responding`, `https://docs.discord.com/developers/resources/message`, `https://docs.discord.com/developers/reference`
- Vercel: `https://vercel.com/docs/functions/limitations`, `https://vercel.com/docs/limits`, `https://vercel.com/docs/limits/fair-use-guidelines`
- AniList: `https://github.com/AniList/ApiV2-GraphQL-Docs/blob/master/docs/guide/rate-limiting.md`
- 저장소: `docs/free-infrastructure.md`, `vercel.json`, `README.md`(Discord 슬래시 명령 절), `src/app/api/discord/interactions/route.ts`, `src/server/discord-interactions/{handler,protocol}.ts`, `command.json`

## 실측 (2026-10-17, 로컬 WSL IP에서 호출)

- `GET https://api.trace.moe/me` → `{"quota":100,"quotaUsed":0,"concurrency":1,"priority":0}`, 응답 헤더 `ratelimit-limit: 100`, `ratelimit-policy: 100;w=60`(60초 창당 100회).
- 게스트 `quota` 100은 확인했다. 단위(일/월)는 응답에 없어 미확인(위 표의 "24시간 단위" 서술은 docs.md 기준). `concurrency: 1`이므로 동시 검색은 1건이다.
- 이 값은 WSL 호스트 IP 기준이다. Vercel 공유 IP는 다른 사용자와 한도를 나눌 수 있어, 운영에서 같은 호출로 다시 확인해야 한다.
- Discord CDN: 공식 reference는 "preset expiry time"이라고만 하고 수명 숫자는 없다. 페이로드로 받은 서명 URL은 유효하다고 명시한다. 서명 없는 표준 CDN 엔드포인트는 만료되지 않는다. 오래된 메시지에서 받은 URL이 갱신본인지는 여전히 실측 필요.
