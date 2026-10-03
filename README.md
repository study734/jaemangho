# ⚓ 재망호 (Jaemangho)

리그 오브 레전드 크루원들의 솔로 랭크 티어, 최근 전적, 실시간 게임 상태, 챔피언 숙련도, 듀오 시너지를 한곳에서 보는 크루 전용 대시보드입니다. UI는 MongoDB 디자인 시스템 테마([DESIGN.md](DESIGN.md))를 따릅니다.

## 기능
- **대시보드**: 크루원별 티어/LP/승률, 최근 전적, 실시간 게임(관전) 상태
- **크루 멤버 관리**: 소환사 검색, 추가, 수정, 삭제 (크루 공용 명단)
- **듀오 시너지 분석**: 함께 플레이한 매치 기반 듀오 승률
- **챔피언 숙련도**: 크루원별 모스트 3 챔피언

## 구조
```
브라우저 (Vite + React SPA)
   │  Discord 로그인 쿠키
   ▼
Vercel Serverless Functions (api/)
   ├─ auth/*      Discord OAuth2 (크루 디스코드 서버 멤버만 허용), 서명된 세션 쿠키
   ├─ riot.js     Riot API 프록시 (허용 엔드포인트만, 키는 서버에서만 사용)
   ├─ members.js  크루원 명단 CRUD
   └─ admin.js    관리자 전용 (접속자/차단, 명단, 시스템 상태)
        │
        ▼
Neon Postgres (명단 저장)
```
- 프런트엔드는 Riot API 키를 갖지 않습니다. 모든 Riot 호출은 `/api/riot`을 거칩니다.
- `/api/riot`, `/api/members`는 로그인 세션이 있어야 호출할 수 있습니다.

## 관리자
- 디스코드 서버 **소유자이거나 Administrator 권한**이 있는 사용자는 로그인 시 자동으로 관리자가 됩니다. 관리자를 추가하려면 디스코드에서 권한만 주면 됩니다(재로그인 필요).
- 사이드바의 **관리자** 탭에서 접속자 목록과 차단/해제, 크루원 명단 삭제, 시스템 상태(Riot 캐시, DB 사용량, 최근 Riot 오류)를 봅니다.
- 차단은 DB가 기준이며 최대 30초 안에 반영됩니다. 관리자는 차단할 수 없습니다.

## 환경변수 (Vercel → Settings → Environment Variables, Production)
| 이름 | 설명 |
|---|---|
| `RIOT_API_KEY` | Riot API 키. `VITE_` 접두사를 붙이면 클라이언트 번들에 노출되므로 붙이지 않습니다. |
| `DISCORD_CLIENT_ID` | Discord 앱의 Client ID |
| `DISCORD_CLIENT_SECRET` | Discord 앱의 Client Secret |
| `DISCORD_GUILD_ID` | 접속을 허용할 디스코드 서버 ID |
| `SESSION_SECRET` | 세션 쿠키 서명용 랜덤 문자열 (`openssl rand -base64 32`) |
| `DATABASE_URL` | Neon 연결 문자열 (Vercel에서 Neon을 연결하면 자동 등록) |

Discord 앱의 OAuth2 Redirects에는 실제 접속 도메인 기준으로 `https://<도메인>/api/auth/callback`을 등록합니다. 도메인이 `www`로 리다이렉트되면 `www` 주소를 등록해야 합니다.

## 로컬 개발
```bash
npm install
npm run dev
```
- 로컬 개발(`vite`)에서는 로그인과 DB 없이 동작합니다. 명단은 브라우저 localStorage에 저장됩니다.
- Riot 호출은 vite 프록시(`/riot-kr`, `/riot-asia`)를 거칩니다. 설정 탭에서 개발용 API 키(`RGAPI-...`)를 입력하거나 `.env.local`에 `VITE_RIOT_API_KEY`를 둡니다. 이 값은 DEV에서만 읽히며 배포 번들에는 들어가지 않습니다.
- 서버리스 함수(`api/`)까지 로컬에서 확인하려면 Vercel CLI(`vercel dev`)가 필요합니다.

```bash
npm run build   # 타입 검사 + 빌드 (dist/)
npm run lint
node api/_lib/auth.check.mjs   # 세션 서명 검증 스크립트
```

## 배포
`main` 브랜치에 머지하면 Vercel이 자동 배포합니다. 환경변수를 바꾼 뒤에는 **재배포**해야 반영됩니다.

## Riot 영구 키
24시간마다 만료되는 개발 키 대신 Personal Product Key를 신청하는 방법은 [RIOT_PRODUCT_KEY_GUIDE.md](RIOT_PRODUCT_KEY_GUIDE.md)를 참고하세요.
