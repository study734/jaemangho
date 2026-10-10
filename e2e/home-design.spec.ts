import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('홈 게임 검색어가 Steam 비교 결과에 이어지고 표지 실패에도 검색을 쓸 수 있다', async ({ page, context }) => {
  await loginAs(context, await createUser('visual_search', '재망호 검색'));
  await page.route('**/api/steam/members**', (route) => route.fulfill({ json: [{ steamId: '76561190000000001', name: '철수', avatar: null }] }));
  await page.route('**/api/steam/games**', (route) => route.fulfill({ json: { games: [{ appId: 413150, name: 'Stardew Valley', totalMinutes: 120 }, { appId: 730, name: 'Counter-Strike 2', totalMinutes: 3000 }], excluded: [] } }));
  await page.route(/steamstatic\.com\/.*header\.jpg/, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Stardew Valley 표지' })).toBeVisible();
  for (const width of [1504, 390]) {
    await page.setViewportSize({ width, height: 1045 });
    const field = await page.getByRole('search').locator('.game-search-field').boundingBox();
    const button = await page.getByRole('search').getByRole('button', { name: '찾기', exact: true }).boundingBox();
    expect(field).not.toBeNull();
    expect(button).not.toBeNull();
    expect(button!.x).toBeGreaterThan(field!.x + field!.width + 4);
  }
  await page.getByLabel('찾을 Steam 게임 이름').fill('Stardew');
  await page.getByRole('search').getByRole('button', { name: '찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam\?q=Stardew$/);
  await expect(page.getByLabel('결과에서 게임 찾기')).toHaveValue('Stardew');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '비교하기 (1명)' }).click();
  await expect(page.getByText('Stardew Valley', { exact: true })).toBeVisible();
  await expect(page.getByText('Counter-Strike 2', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '지우기' }).click();
  await expect(page.getByText('Counter-Strike 2', { exact: true })).toBeVisible();
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/steam-visual-results.png', fullPage: true });
});

test('등록 소환사와 디스코드 집계가 채워져도 홈의 표와 목록을 읽을 수 있다', async ({ page, context }) => {
  test.setTimeout(120_000);
  const names = ['재망호 선장', '초록항해', '바다친구', '오늘도듀오'];
  await loginAs(context, await createUser('filled_design', names[0]));
  for (let i = 1; i < names.length; i++) await createUser(`filled_design_${i}`, names[i]);
  await page.route('**/api/members', (route) => route.fulfill({ json: names.map((name, i) => ({ id: `e2e_design_${i}`, gameName: name, tagLine: 'KR1' })) }));
  await mockRiot(page);
  try {
    for (let i = 0; i < names.length; i++) {
      await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions) values ($1, 'e2e_design_channel', $2, $3, now(), $4)`, [`e2e_design_msg_${i}`, `e2e_design_author_${i}`, names[i], [28, 24, 19, 17][i]]);
    }
    await page.setViewportSize({ width: 1504, height: 1045 });
    await page.goto('/');
    const table = page.getByRole('table', { name: '등록 소환사 랭크 요약' });
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByText('55', { exact: true }).first()).toBeVisible();
    // DB 직접 삽입은 공유 캐시를 무효화하지 않는다. 60초 캐시 만료 뒤 요청이
    // 갱신을 시작하므로, 고정 대기 대신 재요청해 실제 새 집계가 표시되는지 확인한다.
    await expect.poll(async () => {
      await page.reload();
      return page.getByRole('link', { name: '재망호 선장님의 메시지 보러 가기' }).count();
    }, { timeout: 90_000, intervals: [1000, 5000], message: '공유 채팅 캐시가 갱신되어 새 메시지를 표시해야 합니다.' }).toBe(1);
    await expect(page.getByRole('link', { name: '재망호 선장님의 메시지 보러 가기' })).toHaveAttribute('href', /discord\.com\/channels/);
    await expect.poll(() => page.getByRole('img', { name: '게임패드를 든 재망호 막내 재순이' }).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/home-option1-populated.png', fullPage: true });
    await table.scrollIntoViewIfNeeded();
    await expect.poll(() => table.locator('.rank-emblem img').first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: 'output/playwright/home-visual-data.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await table.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await table.evaluate((el) => el.parentElement!.scrollWidth > el.parentElement!.clientWidth)).toBe(true);
    await page.screenshot({ path: 'output/playwright/home-option1-mobile-data.png', fullPage: true });
    await page.getByRole('search').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/home-graphic-mobile-search.png', fullPage: true });
  } finally {
    await db.query("delete from chat_messages where id like 'e2e_design_msg_%'");
  }
});

test('함께 놀기 홈에서 주요 행동이 Steam으로 이어진다', async ({ page, context }) => {
  await loginAs(context, await createUser('design', '재망호 선장'));
  await page.setViewportSize({ width: 1504, height: 1045 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const hero = page.getByRole('img', { name: '게임패드를 든 재망호 막내 재순이' });
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('소환사를 등록하면 친구들의 랭크가 여기에 모여요.')).toBeVisible();
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/home-option1-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '같이 할 게임 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
  expect(errors).toEqual([]);
});

test('모바일에서 메뉴와 주요 행동을 쓸 수 있고 본문이 넘치지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('mobile_design', '바다친구'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: '같이 할 게임 찾기', exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('img', { name: '게임패드를 든 재망호 막내 재순이' }).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const covers = page.locator('.game-cover-grid');
    expect(await covers.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const logout = await page.getByRole('button', { name: '로그아웃' }).boundingBox();
    expect(logout!.height).toBeGreaterThanOrEqual(44);
    const picture = await page.locator('.jaesuni-visual').boundingBox();
    const copy = await page.locator('.jaesuni-copy').boundingBox();
    expect(copy!.y).toBeGreaterThanOrEqual(picture!.y + picture!.height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/home-option1-mobile.png', fullPage: true });
  const nav = page.getByRole('navigation', { name: '주제' });
  await nav.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL(/\/lol\/settings$/);
});

test('캐릭터 이미지 실패 시에도 인사와 게임 찾기를 사용할 수 있다', async ({ page, context }) => {
  await loginAs(context, await createUser('image_design', '오늘도듀오'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/_next\/image\?.*jaesuni-home/, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('img', { name: '게임패드를 든 재망호 막내 재순이' })).toHaveCount(0);
  await expect(page.getByText('왔네! 마침 보여줄 거 있었는데.')).toBeVisible();
  const hero = await page.locator('.jaesuni-hero').boundingBox();
  const title = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(title!.y - hero!.y).toBeLessThan(160);
  await page.getByRole('link', { name: '같이 할 게임 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
});
