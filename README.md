# ⚓ 재망호 (Jaemangho)

리그 오브 레전드 소환사들의 솔로 랭크 티어, 최근 전적, 실시간 게임 상태, 챔피언 숙련도, 듀오 시너지를 한곳에서 보는 크루 전용 대시보드입니다. UI는 MongoDB 디자인 시스템 테마([DESIGN.md](DESIGN.md))를 따릅니다.

## 기능
- **대시보드** (`/lol`): 등록된 소환사별 티어/LP/승률, 최근 전적, 실시간 게임(관전) 상태
- **소환사 관리** (`/lol/squad`): 보고 싶은 소환사를 검색해 목록에 추가, 수정, 삭제 (로그인한 모두가 함께 보는 공용 목록)
- **듀오 시너지 분석** (`/lol/synergy`), **챔피언 숙련도** (`/lol/mastery`), **설정** (`/lol/settings`, Riot 연결 확인)
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
- **새 주제(롤, Steam 같은 큰 단위)를 추가하는 법**: ① `src/features/<이름>/`에 기능과 `index.ts`(화면, 홈 카드용 `<이름>HomeSummary`) 만들기 ② `src/components/nav.tsx`에 상세 메뉴와 `sectionsFor`/`sectionOf` 한 줄씩 ③ `src/app/(app)/<주소>/page.tsx` ④ `src/app/(app)/home.tsx`에 `HomeCard` 하나 추가. 서버 로직은 `src/server/<이름>/`, API는 `/api/<이름>/...`.
- API URL(`/api/riot`, `/api/members`)과 DB 테이블 이름은 아직 롤 기준입니다. 두 번째 카테고리가 생길 때 `/api/<카테고리>/...`로 나눕니다.

## 관리자
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
