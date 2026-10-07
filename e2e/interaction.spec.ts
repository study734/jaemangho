import { cleanup, createUser, db, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('티어 랭킹은 데스크톱에서 LP까지 보이고 긴 이름도 줄바꿈한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ranking_width', 'E2E랭킹너비'));
  const name = '아주긴소환사이름도잘리지않도록';
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_ranking_width', $1, 'KR1')`, [name]);
  await mockRiot(page, { gameName: name, tagLine: 'KR1' });
  await page.goto('/lol');
  const region = page.getByRole('region', { name: '티어 랭킹 표' });
  await expect(region.getByText('55 LP')).toBeVisible();
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => region.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const lp = await region.getByText('55 LP').boundingBox();
    const bounds = await region.boundingBox();
    expect(lp!.x + lp!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    expect(await region.getByRole('button', { name: `${name}#KR1 상세 보기` }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const lp = await region.getByText('55 LP').boundingBox();
  const bounds = await region.boundingBox();
  expect(lp!.x + lp!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
});

test('본문 건너뛰기와 소환사 상세의 키보드 동작, 새 상세 데이터 표시', async ({ page, context }) => {
  await loginAs(context, await createUser('keyboard', 'E2E키보드'));
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_keyboard', 'E2E키보드', 'KR1')`);
  await mockRiot(page, { gameName: 'E2E키보드', tagLine: 'KR1' });
  await page.route(/\/api\/riot\?/, route => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? '';
    if (path.endsWith('/ids')) return route.fulfill({ json: ['KR_TEST'] });
    if (path.endsWith('/matches/KR_TEST')) return route.fulfill({ json: { info: {
      gameCreation: Date.now(), gameDuration: 1200,
      participants: [{ puuid: 'E2EPUUID', championName: 'Ahri', win: true, kills: 9, deaths: 1, assists: 3 }],
    } } });
    if (path.includes('/spectator/')) return route.fulfill({ json: {
      gameId: 1, gameLength: 1200, gameStartTime: Date.now() - 1200000, mapId: 11, gameMode: 'CLASSIC',
      participants: [
        { puuid: 'E2EPUUID', riotId: 'E2E키보드#KR1', teamId: 100, championId: 103 },
        { puuid: 'ALLY', riotId: '아군이름#KR1', teamId: 100, championId: 22 },
        { puuid: 'ENEMY', riotId: '적군이름#KR1', teamId: 200, championId: 86 },
      ],
    } });
    return route.fallback();
  });
  await page.goto('/lol');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const open = page.getByRole('button', { name: 'E2E키보드#KR1 상세 보기' });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('12.00')).toBeVisible();
  await page.keyboard.press('Tab');
  // 단일 버튼 다음 Tab은 브라우저 주소창으로 갈 수 있다. 배경 페이지는 모달 동안 inert여야 한다.
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '상세 닫기' })).toBeFocused();
  await open.evaluate(el => (el as HTMLButtonElement).focus());
  await expect(dialog.getByRole('button', { name: '상세 닫기' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  const allies = page.getByText('아군 팀', { exact: true }).locator('..');
  const enemies = page.getByText('적군 팀', { exact: true }).locator('..');
  await expect(allies).toContainText('아군이름');
  await expect(allies).not.toContainText('적군이름');
  await expect(enemies).toContainText('적군이름');
  await expect(enemies).not.toContainText('아군이름');
  await open.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByText('12.00')).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThan(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const card = dialog.locator('.player-match-card').first();
  expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: '상세 닫기' }).click();
  await expect(open).toBeFocused();
});

test('Riot 조회 실패는 정상 데이터처럼 숨기지 않고 재시도를 안내한다', async ({ page, context }) => {
  await loginAs(context, await createUser('refresh_fail', 'E2E조회실패'));
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_refresh_fail', 'E2E실패', 'KR1')`);
  let rosterFailed = true;
  await page.route('**/api/members', route => rosterFailed ? route.fulfill({ status: 500, json: {} }) : route.fallback());
  await page.route(/\/api\/riot\?/, route => route.fulfill({ status: 429, json: {} }));
  await page.goto('/lol');
  await expect(page.getByRole('alert').filter({ hasText: '소환사 목록을 불러오지 못했습니다.' })).toBeVisible();
  rosterFailed = false;
  await page.getByRole('button', { name: '롤 정보 다시 불러오기' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '최신 정보를 불러오지 못했습니다.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '롤 정보 다시 불러오기' })).toBeVisible();
});
