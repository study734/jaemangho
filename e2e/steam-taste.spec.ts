import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

const ids = ['76561190000000021', '76561190000000022'];
async function clearMembers() { await db.query('delete from steam_members where steam_id=any($1)', [ids]); }
test.beforeEach(async () => { await clearMembers(); await cleanup(); });
test.afterAll(async () => { await clearMembers(); await cleanup(); });

test('개인 취향을 공통 추천 데이터로 저장하고 삭제하면 실제 서버 순위에 반영한다', async ({ page, context }) => {
  const one = await createUser('coop_one', '협동 하나'), two = await createUser('coop_two', '협동 둘');
  await loginAs(context, one); await loginAs(context, two); await loginAs(context, one);
  for (const [i, id] of ids.entries()) {
    await db.query(`insert into steam_members(steam_id,persona_name,owner_id) values($1,$2,$3)`, [id, `협동 멤버 ${i + 1}`, i ? two.id : one.id]);
    for (const [key, body] of [
      [`/IPlayerService/GetOwnedGames/v1/?steamid=${id}&include_appinfo=1&include_played_free_games=1`, { response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: 240 }, { appid: 1599600, name: 'PlateUp!', playtime_forever: 60 }] } }],
      [`/IPlayerService/GetRecentlyPlayedGames/v1/?steamid=${id}&count=0`, { response: { total_count: 0 } }],
    ] as const) await db.query(`insert into steam_cache(key,body,expires_at) values($1,$2::jsonb,now()+interval '1 hour') on conflict(key) do update set body=excluded.body,expires_at=excluded.expires_at`, [key, JSON.stringify(body)]);
  }
  for (const appId of [620, 1599600]) await db.query(`insert into steam_cache(key,body,expires_at) values($1,'"coop"',now()+interval '1 hour') on conflict(key) do update set body=excluded.body,expires_at=excluded.expires_at`, [`store:play-support:v1:${appId}`]);
  await page.route('**/store_item_assets/**', route => route.abort());
  await page.goto('/steam');
  await expect(page.getByRole('link', { name: '내 취향 추천', exact: true })).toHaveCount(0);
  await page.getByText('내 추천 데이터·취향 설정', { exact: true }).click();
  await page.getByText('공통 추천에 쓸 내 취향', { exact: true }).click();
  await page.getByRole('combobox', { name: '요리 취향', exact: true }).selectOption('like');
  await page.getByRole('button', { name: '게임 취향 저장', exact: true }).click();
  await expect(page.getByText('게임 취향을 저장했어요. 다음 공통 추천부터 반영해요.')).toBeVisible();
  await page.getByText('내 추천 데이터·취향 설정', { exact: true }).click();
  await page.getByRole('checkbox', { name: '협동 멤버 1', exact: true }).check();
  await page.getByRole('checkbox', { name: '협동 멤버 2', exact: true }).check();
  await page.getByRole('button', { name: '추천받기 (2명)' }).click();
  await expect(page.getByText(/저장 취향 반영 1명/)).toBeVisible();
  await expect(page.locator('.steam-recommendations > li').first()).toContainText('PlateUp!');
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('region', { name: '오늘 같이 할 게임' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/steam-common-taste-${width}.png`, fullPage: true });
  }
  await page.reload();
  await page.getByText('내 추천 데이터·취향 설정', { exact: true }).click();
  await page.getByText('공통 추천에 쓸 내 취향', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: '요리 취향', exact: true })).toHaveValue('like');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '게임 취향 전체 삭제' }).click();
  await expect(page.getByText('게임 취향을 지웠어요.')).toBeVisible();
  const response = await context.request.get(`/api/steam/recommendations?ids=${ids.join(',')}`);
  expect(response.ok()).toBe(true); expect((await response.json()).sharedPreferences).toBe(0);
  expect((await context.request.post('/api/steam/personalized', { data: {} })).status()).toBe(404);
});

test('취향 조회 오류를 빈 데이터와 구분하고 수동으로 재시도한다', async ({ page, context }) => {
  await loginAs(context, await createUser('taste_error', '추천 오류 친구'));
  await page.route('**/api/steam/taste', route => route.fulfill({ status: 503, json: { error: '취향 조회 실패' } }));
  await page.goto('/steam'); await page.getByText('내 추천 데이터·취향 설정', { exact: true }).click();
  await expect(page.locator('#game-taste').getByRole('alert')).toContainText('취향 조회 실패');
  await page.unroute('**/api/steam/taste'); await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByText(/내 연결 계정: 아직 없어요/)).toBeVisible();
});
