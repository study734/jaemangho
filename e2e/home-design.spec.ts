import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('제공 기능은 재순이 메시지의 임베드에서 사용하고 모든 게임·기록 채널에 표시한다', async ({ page, context }) => {
  await loginAs(context, await createUser('jaesuni_tools', '기능친구'));
  await mockRiot(page);
  await mkdir('output/playwright', { recursive: true });
  for (const path of ['/play', '/memories', '/steam', '/lol', '/lol/squad', '/lol/synergy', '/lol/mastery', '/community', '/community/awards']) {
    await page.goto(path);
    const message = page.getByRole('article', { name: '재순이의 기능 안내' });
    await expect(message).toHaveCount(1);
    await expect(message.locator('.dc-head')).toHaveText('재순이앱');
    await expect(message.locator('.jaesuni-tool-content')).toBeVisible();
    if (['/steam', '/lol', '/community'].includes(path)) {
      for (const width of [1504, 1024, 390]) {
        await page.setViewportSize({ width, height: 1045 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `output/playwright/jaesuni-${path.slice(1)}-${width}.png` });
      }
      await page.setViewportSize({ width: 1504, height: 1045 });
    }
  }
  await page.goto('/');
  const tools = page.locator('.home-tools-message');
  await expect(tools.locator('.dc-head')).toHaveText('재순이앱');
  await expect(tools.getByRole('search')).toBeVisible();
  await expect(tools.getByRole('link', { name: '같이 할 게임 찾기', exact: true })).toBeVisible();
  const toolsBox = await tools.boundingBox();
  const summariesBox = await page.locator('.home-grid').boundingBox();
  expect(toolsBox!.y + toolsBox!.height).toBeLessThanOrEqual(summariesBox!.y);
});

test('PC 오른쪽은 멤버 활동 패널이고 헤더 버튼으로 접고 펼칠 수 있다', async ({ page, context }) => {
  await loginAs(context, await createUser('channel_shell', '채널친구'));
  await page.setViewportSize({ width: 1504, height: 640 });
  await page.goto('/');
  const feed = page.locator('.home-channel-feed');
  const members = page.getByRole('complementary', { name: '멤버 활동과 최근 접속' });
  const initial = await members.boundingBox();
  await expect(members.getByRole('heading', { name: /최근 활동/ })).toBeVisible();
  await expect(members.locator('.member-activity-card')).toContainText('사이트 접속');
  await expect(members.locator('.member-row')).toContainText('채널친구');
  await expect(members.getByRole('search')).toHaveCount(0);
  await expect(feed.getByRole('search')).toBeVisible();
  await expect(page.locator('.channel-sidebar').getByRole('link', { name: '멤버', exact: true })).toHaveCount(0);
  await feed.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect((await members.boundingBox())!.y).toBe(initial!.y);
  const toggle = page.getByRole('button', { name: '멤버 활동 패널' });
  const expandedWidth = (await feed.boundingBox())!.width;
  await toggle.click();
  await expect(members).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await feed.boundingBox())!.width).toBeGreaterThan(expandedWidth);
  await toggle.click();
  await expect(members).toBeVisible();
  await expect(page.locator('.channel-user')).toBeVisible();
  const rail = page.getByRole('navigation', { name: '서버 목록' });
  await page.locator('.channel-sidebar').getByRole('link', { name: 'Steam 공통 게임' }).click();
  await expect(page).toHaveURL(/\/steam$/);
  await expect(rail.getByRole('link', { name: '재망호 서버' })).toHaveAttribute('aria-current', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rail).toBeHidden();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
});

test('긴 이름과 이미지 실패에도 홈 글자·표지·검색이 잘리지 않는다', async ({ page, context }) => {
  const name = 'LongUnbrokenMemberName'.repeat(5);
  const user = await createUser('home_long_name', name);
  await loginAs(context, user);
  await db.query(`update "user" set image = '/images/games/413150.jpg' where id = $1`, [user.id]);
  await page.goto('/?discovery=play%3Asteam');
  await mkdir('output/playwright', { recursive: true });
  for (const width of [1504, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1045 });
    expect(await page.locator('.home-steam-top').evaluate(el => getComputedStyle(el, '::before').content)).toBe('none');
    expect(await page.locator('.home-card-heading').evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
    expect(await page.locator('.community-graphic-heading').evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
    for (const selector of ['.home-card-heading', '.community-graphic-heading']) {
      expect(await page.locator(selector).evaluate(el => getComputedStyle(el, '::before').content)).toBe('none');
    }
    for (const selector of ['.home-play', '.discovery-deck', '.game-cover-grid']) {
      expect(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await expect(page.locator('.home-play').getByText(`${name}님, 멤버만 고르면 시작할 수 있어요.`)).toBeVisible();
    await page.locator('.discovery-deck').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/home-long-name-${width}.png` });
    const avatar = page.locator('.member-avatar img').first();
    await avatar.scrollIntoViewIfNeeded();
    await expect.poll(() => avatar.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const box = await avatar.boundingBox();
    expect(box!.width).toBe(box!.height);
    await page.screenshot({ path: `output/playwright/home-long-member-${width}.png` });
  }
  await page.route('**/images/games/413150.jpg', route => route.abort());
  await page.reload();
  const fallback = page.locator('.member-avatar .visual-fallback').first();
  await expect.poll(async () => {
    await page.locator('.member-avatar').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
    return fallback.isVisible();
  }).toBe(true);
  await expect(fallback).toHaveText('L');
  await page.screenshot({ path: 'output/playwright/home-member-image-failure.png' });
});

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
    const discovery = await page.locator('.discovery-deck').boundingBox();
    const play = await page.locator('.home-play').boundingBox();
    expect(play!.y).toBeGreaterThanOrEqual(discovery!.y + discovery!.height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/home-option1-mobile.png', fullPage: true });
  const nav = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(nav.getByRole('link')).toHaveCount(4);
  await page.getByRole('banner').getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL(/\/lol\/settings$/);
});

test('캐릭터 이미지 실패 시에도 인사와 게임 찾기를 사용할 수 있다', async ({ page, context }) => {
  await loginAs(context, await createUser('image_design', '오늘도듀오'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/_next\/image\?.*jaesuni-home/, (route) => route.abort());
  await page.route('**/images/jaesuni-home.webp', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('img', { name: '게임패드를 든 재망호 막내 재순이' })).toHaveCount(0);
  await expect(page.locator('.discovery-dialogue')).toContainText('재망호 발견 · 재순이');
  await expect(page.locator('.discovery-dialogue p').last()).toBeVisible();
  await expect(page.locator('.home-tools-message .visual-fallback')).toHaveText('재');
  const stage = await page.locator('.discovery-deck .dc-message').boundingBox();
  const title = await page.locator('.discovery-dialogue').boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(stage!.y);
  expect(title!.y + title!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
  await page.getByRole('link', { name: '같이 할 게임 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
});
