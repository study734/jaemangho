# ⚓ 재망호 (Jaemangho)

리그 오브 레전드 소환사들의 솔로 랭크 티어, 최근 전적, 실시간 게임 상태, 챔피언 숙련도, 듀오 시너지를 한곳에서 보는 크루 전용 대시보드입니다. UI는 MongoDB 디자인 시스템 테마([DESIGN.md](DESIGN.md))를 따릅니다.

## 기능
- **대시보드** (`/lol`): 등록된 소환사별 티어/LP/승률, 최근 전적, 실시간 게임(관전) 상태
- **소환사 관리** (`/lol/squad`): 보고 싶은 소환사를 검색해 목록에 추가, 수정, 삭제 (로그인한 모두가 함께 보는 공용 목록)
- **듀오 시너지 분석** (`/lol/synergy`), **챔피언 숙련도** (`/lol/mastery`), **설정** (`/lol/settings`, Riot 연결 확인)
- **관리자** (`/admin`): 아래 참고

## 기술 구성
Next.js(App Router) + React 19 + TypeScript(strict), Neon Postgres, Vercel 배포.

```
브라우저 ──(디스코드 로그인 쿠키)──> Next.js (Vercel)
   src/app/(app)/*  화면 (서버 컴포넌트에서 로그인/차단 확인 후 렌더)
   src/app/api/*    라우트 핸들러
        ├─ auth/*      디스코드 OAuth2 (서버 멤버만 허용), 서명된 세션 쿠키
        ├─ riot        Riot API 프록시 (허용 엔드포인트만, 키는 서버에서만 사용, DB 캐시)
        ├─ members     등록 소환사 목록 CRUD
        └─ admin       관리자 전용 (접속자/차단, 목록, 시스템 상태, 캐시 비우기)
        │
        ▼
Neon Postgres (소환사 목록, 접속자, Riot 캐시/통계/오류)
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
└─ server/                  서버 전용 (세션, DB, 접근 제어, Riot 캐시/허용 경로)
```
- **의존 방향**: `app -> features / server`. 공용 UI는 기능과 서버를 모르고(값은 props로 받음), 기능은 화면·서버·다른 기능을 가져오지 않고, 서버는 화면과 기능을 가져오지 않습니다. 새 카테고리는 `src/features/<이름>/`에 `index.ts`와 함께 추가합니다.
- 이 규칙은 `npm run lint`가 검사합니다(`no-restricted-imports`). 어기면 린트가 실패하고 CI에서도 막힙니다.
- Riot 데이터 접근은 `RiotClient` 인터페이스 뒤에 있어(지역, 주소 형식, 캐시 키는 호출자가 모름) 테스트에서는 가짜로 바꿔 끼웁니다.
- API URL(`/api/riot`, `/api/members`)과 DB 테이블 이름은 아직 롤 기준입니다. 두 번째 카테고리가 생길 때 `/api/<카테고리>/...`로 나눕니다.

## 관리자
- 디스코드 서버 **소유자이거나 Administrator 권한**이 있는 사용자는 로그인 시 자동으로 관리자가 됩니다. 관리자를 추가하려면 디스코드에서 권한만 주면 됩니다(재로그인 필요).
- 사이드바의 **관리자** 탭에서 접속자 목록과 차단/해제, 등록 소환사 삭제, 시스템 상태(Riot 캐시, DB 사용량, Riot 호출 통계, 최근 Riot 오류), 캐시 비우기를 합니다.
- 차단은 DB가 기준이며 최대 30초 안에 반영됩니다. 관리자는 차단할 수 없습니다.

## 환경변수 (Vercel → Settings → Environment Variables, Production / 로컬은 `.env.local`)
| 이름 | 설명 |
|---|---|
| `RIOT_API_KEY` | Riot API 키 |
| `DISCORD_CLIENT_ID` | Discord 앱의 Client ID |
| `DISCORD_CLIENT_SECRET` | Discord 앱의 Client Secret |
| `DISCORD_GUILD_ID` | 접속을 허용할 디스코드 서버 ID |
| `SESSION_SECRET` | 세션 쿠키 서명용 랜덤 문자열 (`openssl rand -base64 32`) |
| `DATABASE_URL` | Neon 연결 문자열 (Vercel에서 Neon을 연결하면 자동 등록) |
| `DEV_LOGIN` | `1`이면 **개발 서버에서만** 디스코드 로그인 없이 관리자로 접속 (운영 빌드에서는 무시됨) |

Discord 앱의 OAuth2 Redirects에는 실제 접속 도메인 기준으로 `https://<도메인>/api/auth/callback`을 등록합니다. 도메인이 `www`로 리다이렉트되면 `www` 주소를 등록해야 합니다. 로컬에서 실제 로그인을 시험하려면 `http://localhost:3000/api/auth/callback`도 추가합니다.

## 로컬 개발
```bash
npm install
cp .env.example .env.local   # 값을 채웁니다 (없으면 아래 예시 참고)
npm run dev                   # http://localhost:3000
```
`.env.local` 예시 (로그인 없이 개발하려면 `DEV_LOGIN=1`):
```
DATABASE_URL=...        # 운영 DB를 건드리지 않으려면 Neon 개발 브랜치를 권장
RIOT_API_KEY=RGAPI-...
SESSION_SECRET=아무거나
DEV_LOGIN=1
```
개발 서버도 운영과 같은 서버 라우트를 사용하므로 DB 연결이 필요합니다.

```bash
npm run build   # 타입 검사 + 운영 빌드
npm run lint    # 코드 규칙 + 모듈 경계 검사
npm test        # 단위 테스트 (vitest)
```

## 배포
`main` 브랜치에 머지하면 Vercel이 자동 배포합니다. 환경변수를 바꾼 뒤에는 **재배포**해야 반영됩니다. `main` 이외 브랜치는 빌드하지 않습니다(`vercel.json`의 `ignoreCommand`).

## Riot 영구 키
24시간마다 만료되는 개발 키 대신 Personal Product Key를 신청하는 방법은 [RIOT_PRODUCT_KEY_GUIDE.md](RIOT_PRODUCT_KEY_GUIDE.md)를 참고하세요.
