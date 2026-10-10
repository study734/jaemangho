import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('Steam 비교 결과를 50개씩 표시하고 검색하면 첫 묶음으로 돌아간다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_pagination', '게임목록'));
  await page.route('**/api/steam/members**', route => route.fulfill({ json: [{ steamId: '76561190000000001', name: '게임목록', avatar: null }] }));
  await page.route('**/api/steam/games**', route => route.fulfill({ json: {
    games: Array.from({ length: 120 }, (_, i) => ({ appId: i + 1, name: `Game ${i + 1}`, totalMinutes: 0 })), excluded: [],
  } }));
  await page.route(/steamstatic\.com\/.*header\.jpg/, route => route.abort());
  await page.goto('/steam');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '비교하기 (1명)' }).click();
  await expect(page.locator('.result-game-cover')).toHaveCount(50);
  await page.getByRole('button', { name: /게임 더 보기/ }).click();
  await expect(page.locator('.result-game-cover')).toHaveCount(100);
  await page.getByLabel('결과에서 게임 찾기').fill('Game 119');
  await expect(page.locator('.result-game-cover')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /게임 더 보기/ })).toHaveCount(0);
});
