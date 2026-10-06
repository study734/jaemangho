import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

const today = `(now() at time zone 'Asia/Seoul')::date`;
const views = async (path: string) => (await db.query(`select coalesce(sum(views), 0)::int as n from page_views where path = $1 and day = ${today}`, [path])).rows[0].n as number;

test('화면을 열면 그 화면의 오늘 횟수가 늘고, 프로필은 id와 상관없이 한 화면으로 센다', async ({ page, context }) => {
  await loginAs(context, await createUser('analytics', 'E2E집계'));
  const steam = await views('/steam');
  const profile = await views('/people/[id]');

  await page.goto('/steam');
  await expect.poll(() => views('/steam')).toBe(steam + 1);

  await page.goto('/people/e2e_analytics');
  await expect.poll(() => views('/people/[id]')).toBe(profile + 1);
  // 개인 식별 값(프로필 id)이 키로 남지 않는다
  expect((await db.query(`select count(*)::int as n from page_views where path like '%e2e_analytics%'`)).rows[0].n).toBe(0);
});

test('관리자 화면의 화면별 열람 표에 횟수가 보인다', async ({ page, context }) => {
  await loginAs(context, await createUser('analytics_reader', 'E2E열람자'));
  const steam = await views('/steam');
  await page.goto('/steam');
  await expect.poll(() => views('/steam')).toBe(steam + 1);

  const admin = await createUser('analytics_admin', 'E2E집계관리자', 'admin');
  await loginAs(context, admin);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '화면별 열람 (최근 7일)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Steam 공통 게임' })).toBeVisible();
});

test('관리자의 화면 방문과 직접 수집 요청은 열람 횟수를 늘리지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('analytics_excluded_admin', 'E2E제외관리자', 'admin'));

  for (const path of ['/steam', '/people/e2e_analytics_excluded_admin', '/admin']) {
    const key = path.startsWith('/people/') ? '/people/[id]' : path;
    const before = await views(key);
    const tracked = page.waitForResponse((response) =>
      response.url().endsWith('/api/track') && response.request().postDataJSON()?.path === path
    );
    await page.goto(path);
    expect((await tracked).status()).toBe(204);
    expect(await views(key)).toBe(before);

    const response = await context.request.post('/api/track', { data: { path } });
    expect(response.status()).toBe(204);
    expect(await views(key)).toBe(before);
  }
});
