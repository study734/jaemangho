# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> 로그인하지 않은 방문자 >> 모든 API가 거부된다
- Location: e2e/auth.spec.ts:14:3

# Error details

```
Error: /api/members

expect(received).toBe(expected) // Object.is equality

Expected: 401
Received: 200
```

# Test source

```ts
  1  | import { SESSION_COOKIE, cleanup, createUser, db, expect, loginAs, statusOf, test } from './fixtures';
  2  | 
  3  | test.beforeEach(cleanup);
  4  | test.afterAll(cleanup);
  5  | 
  6  | test.describe('로그인하지 않은 방문자', () => {
  7  |   test('앱 화면은 로그인 화면으로 보내진다', async ({ page }) => {
  8  |     await page.goto('/lol');
  9  |     await expect(page).toHaveURL(/\/login$/);
  10 |     await expect(page.getByRole('button', { name: '디스코드로 로그인' })).toBeVisible();
  11 |     await expect(page.getByText('크루 디스코드 서버 멤버만 접속할 수 있습니다.')).toBeVisible();
  12 |   });
  13 | 
  14 |   test('모든 API가 거부된다', async ({ request }) => {
  15 |     for (const path of ['/api/members', '/api/admin?resource=users', '/api/riot?region=kr&path=/lol/league/v4/entries/by-puuid/a']) {
> 16 |       expect((await request.get(path)).status(), path).toBe(401);
     |                                                        ^ Error: /api/members
  17 |     }
  18 |     expect((await request.post('/api/members', { data: { id: 'e2e_x', gameName: 'x', tagLine: 'y' } })).status()).toBe(401);
  19 |   });
  20 | 
  21 |   test('위조한 세션 쿠키는 인정되지 않는다', async ({ page, context }) => {
  22 |     await context.addCookies([
  23 |       { name: SESSION_COOKIE, value: 'e2e_tok_forged.AAAA', domain: 'localhost', path: '/', httpOnly: true },
  24 |     ]);
  25 |     await page.goto('/lol');
  26 |     await expect(page).toHaveURL(/\/login$/);
  27 |   });
  28 | 
  29 |   test('로그인 오류 코드는 사용자에게 알아볼 수 있는 문구로 보인다', async ({ page }) => {
  30 |     await page.goto('/login?error=unable_to_get_user_info');
  31 |     await expect(page.getByText('서버 멤버가 아니거나 차단된 계정입니다')).toBeVisible();
  32 |     await expect(page.getByText('오류 코드: unable_to_get_user_info')).toBeVisible();
  33 |   });
  34 | });
  35 | 
  36 | test.describe('일반 사용자', () => {
  37 |   test('앱을 쓸 수 있지만 관리자 기능은 보이지 않고 접근도 막힌다', async ({ page, context, request }) => {
  38 |     const user = await createUser('user1', 'E2E일반');
  39 |     await loginAs(context, user);
  40 | 
  41 |     await page.goto('/lol');
  42 |     await expect(page.getByRole('link', { name: '소환사 관리' })).toBeVisible();
  43 |     await expect(page.getByRole('link', { name: '관리자' })).toHaveCount(0);
  44 | 
  45 |     await page.goto('/admin');
  46 |     await expect(page).toHaveURL(/\/lol$/); // 관리자 화면은 일반 사용자를 앱으로 돌려보낸다
  47 | 
  48 |     expect(await statusOf(page, '/api/admin?resource=users')).toBe(403); // 로그인했지만 관리자가 아님
  49 |     expect((await request.get('/api/admin?resource=users')).status()).toBe(401); // 쿠키 없는 요청은 401
  50 |   });
  51 | 
  52 |   test('로그인한 사용자가 /login 에 가면 앱으로 간다', async ({ page, context }) => {
  53 |     await loginAs(context, await createUser('user2', 'E2E일반2'));
  54 |     await page.goto('/login');
  55 |     await expect(page).toHaveURL(/\/lol$/);
  56 |   });
  57 | 
  58 |   test('로그아웃하면 세션이 삭제되고 다시 앱에 들어갈 수 없다', async ({ page, context }) => {
  59 |     const user = await createUser('user3', 'E2E일반3');
  60 |     await loginAs(context, user);
  61 |     await page.goto('/lol');
  62 | 
  63 |     await page.getByRole('button', { name: '로그아웃' }).click();
  64 |     await expect(page).toHaveURL(/\/login$/);
  65 | 
  66 |     expect((await db.query(`select count(*)::int as n from session where "userId" = $1`, [user.id])).rows[0].n).toBe(0);
  67 |     await page.goto('/lol');
  68 |     await expect(page).toHaveURL(/\/login$/);
  69 |   });
  70 | });
  71 | 
```