# 재망호 에이전트 규칙

구조, 환경변수, 마이그레이션, 관리자 동작은 [README.md](README.md)가 기준입니다. 여기에는 그곳에 없는 작업 규칙만 둡니다.

## 명령
```bash
npm run lint       # 코드 규칙 + 모듈 경계. CI 필수
npm test           # vitest. TEST_DATABASE_URL이 있어야 DB 통합 테스트가 돈다
npm run build      # 타입 검사 + 운영 빌드. CI 필수
npm run test:e2e   # Playwright. CI 필수
npm run db:migrate # migrations/ 적용
```
변경을 끝내기 전에 lint, test, build를 돌리고 실패한 채로 완료라고 하지 않습니다.

## 반드시 사람에게 먼저 확인 (바꾸기 전에 멈춘다)
- 로그인·접근 제어·차단: `src/server/auth.ts`, `viewer.ts`, `discord.ts`, 관리자 판정 로직
- 이미 적용된 `migrations/*.sql` 수정 (체크섬이 달라져 배포가 깨진다. 변경은 항상 다음 번호의 새 파일)
- 환경변수 추가·이름 변경·삭제, `vercel.json`, `.github/workflows/`
- 의존성 메이저 업그레이드, 저장소 설정(브랜치 보호, 머지 방식)
- 운영 DB와 Vercel 환경에 대한 직접 조작

## 코드 규칙
- **모듈 경계는 lint가 강제한다**(`eslint.config.js`). 새 기능은 `src/features/<이름>/`에 `index.ts`와 함께 만들고, `src/app`은 `index.ts`로만 가져온다. lint를 끄거나 규칙을 완화해서 통과시키지 않는다.
- **라우트 핸들러(`src/app/api`)는 얇게**: 인증 -> zod 검증(`src/server/http.ts`) -> 서비스 호출 -> 응답. SQL과 로직은 `src/server`에 두고 거기서 테스트한다.
- **Riot 호출은 `/api/riot` 프록시를 거친다.** 브라우저에 API 키를 두지 않는다. 새 엔드포인트는 `src/server/riot/routes.ts`의 허용 목록과 TTL에 추가하고 `routes.test.ts`를 갱신한다. 401/403/429/5xx는 캐시하지 않는다(`proxy.ts`).
- 마이그레이션은 이전 버전 코드와도 호환되게 쓴다(컬럼 삭제·이름 변경은 두 번의 배포로 나눈다). `user` 등 로그인 테이블을 바꾸면 `schema-drift` 테스트가 잡는다.
- 동작이 바뀌면 테스트를 함께 바꾼다. 서버 로직은 `*.test.ts`/`*.integration.test.ts`, 사용자 흐름은 `e2e/`.
- 새 UI는 `src/features/lol/components/`(앱 공용은 `src/components/`)에 만든다. 기존 컴포넌트처럼 파일 안의 `styles` 객체와 `src/app/globals.css`의 클래스를 쓰고, 색·글꼴·모서리 값은 [DESIGN.md](DESIGN.md)의 토큰을 따른다(버튼은 pill 형태, 카드 12px, 입력 8px). 임의의 새 색을 만들지 않는다.

## Riot API 문제 진단 순서
1. `src/server/riot/routes.ts`에 경로가 허용돼 있는지(허용되지 않으면 프록시가 거부한다).
2. 상태 코드: 401 키 형식 오류, 403 키 만료(개발 키는 24시간), 404 대상 없음(닉네임·태그 확인), 429 호출 한도 초과.
3. 관리자 화면의 "최근 Riot 오류"와 호출 통계, `proxy.test.ts`로 재현.
4. 지역: 계정 조회는 `asia`, 나머지는 `kr`.

## Git 흐름
- `main`은 보호돼 있다. 브랜치에서 작업하고 PR을 올리며, CI(`check`, `e2e`)가 통과해야 머지된다. main에 직접 푸시하지 않는다.
- PR은 하나의 주제만 담는다. 커밋 메시지는 `feat:`, `fix:`, `chore:`, `test:`, `refactor:` 접두사를 쓴다.
- 비밀 값(`.env*`, 키, 토큰)을 커밋하거나 대화·PR 본문에 적지 않는다.
