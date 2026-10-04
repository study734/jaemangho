import { SESSION_COOKIE, cleanup, createUser, db, expect, loginAs, statusOf, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test.describe('로그인하지 않은 방문자', () => {
  test('앱 화면은 로그인 화면으로 보내진다', async ({ page }) => {
    await page.goto('/lol');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: '디스코드로 로그인' })).toBeVisible();
    await expect(page.getByText('크루 디스코드 서버 멤버만 접속할 수 있습니다.')).toBeVisible();
  });

  test('모든 API가 거부된다', async ({ request }) => {
    for (const path of ['/api/members', '/api/steam/members', '/api/steam/games?ids=76561190000000001', '/api/admin?resource=users', '/api/riot?region=kr&path=/lol/league/v4/entries/by-puuid/a']) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    expect((await request.patch('/api/steam/members', { data: { steamId: '76561190000000001', ownerId: null } })).status()).toBe(401);
    expect((await request.post('/api/steam/members', { data: { input: 'someone' } })).status()).toBe(401);
    expect((await request.post('/api/members', { data: { id: 'e2e_x', gameName: 'x', tagLine: 'y' } })).status()).toBe(401);
  });

  test('위조한 세션 쿠키는 인정되지 않는다', async ({ page, context }) => {
    await context.addCookies([
      { name: SESSION_COOKIE, value: 'e2e_tok_forged.AAAA', domain: 'localhost', path: '/', httpOnly: true },
    ]);
    await page.goto('/lol');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('로그인 오류 코드는 사용자에게 알아볼 수 있는 문구로 보인다', async ({ page }) => {
    await page.goto('/login?error=unable_to_get_user_info');
    await expect(page.getByText('서버 멤버가 아니거나 차단된 계정입니다')).toBeVisible();
    await expect(page.getByText('오류 코드: unable_to_get_user_info')).toBeVisible();
  });
});

test.describe('일반 사용자', () => {
  test('앱을 쓸 수 있지만 관리자 기능은 보이지 않고 접근도 막힌다', async ({ page, context, request }) => {
    const user = await createUser('user1', 'E2E일반');
    await loginAs(context, user);

    await page.goto('/lol');
    await expect(page.getByRole('link', { name: '소환사 관리' })).toBeVisible();
    await expect(page.getByRole('link', { name: '관리자' })).toHaveCount(0);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/lol$/); // 관리자 화면은 일반 사용자를 앱으로 돌려보낸다

    expect(await statusOf(page, '/api/admin?resource=users')).toBe(403); // 로그인했지만 관리자가 아님
    expect((await request.get('/api/admin?resource=users')).status()).toBe(401); // 쿠키 없는 요청은 401
  });

  test('로그인한 사용자가 /login 에 가면 앱으로 간다', async ({ page, context }) => {
    await loginAs(context, await createUser('user2', 'E2E일반2'));
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('로그아웃하면 세션이 삭제되고 다시 앱에 들어갈 수 없다', async ({ page, context }) => {
    const user = await createUser('user3', 'E2E일반3');
    await loginAs(context, user);
    await page.goto('/lol');

    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);

    expect((await db.query(`select count(*)::int as n from session where "userId" = $1`, [user.id])).rows[0].n).toBe(0);
    await page.goto('/lol');
    await expect(page).toHaveURL(/\/login$/);
  });
});
