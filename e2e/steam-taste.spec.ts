import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';
import { BASE_URL } from './env';

const ids = ['76561190000000021', '76561190000000022', '76561190000000023', '76561190000000024'];
async function clearMembers() { await db.query('delete from steam_members where steam_id=any($1)', [ids]); }
test.beforeEach(async () => { await clearMembers(); await cleanup(); });
test.afterAll(async () => { await clearMembers(); await cleanup(); });

test('개인 취향을 저장하고 내 플레이 기록으로 실제 서버에서 추천한다', async ({ page, context }) => {
  const one = await createUser('taste_one', '추천 친구 하나'), two = await createUser('taste_two', '추천 친구 둘');
  await loginAs(context, one);
  for (const [i, id] of ids.entries()) {
    await db.query(`insert into steam_members(steam_id,persona_name,owner_id,created_by,created_by_name) values($1,$2,$3,$4,$5)`, [id, `추천 멤버 ${i + 1}`, i === 0 ? one.id : i === 1 ? two.id : null, one.id, one.name]);
    const owned = { response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: 240 }, { appid: 1599600, name: 'PlateUp!', playtime_forever: 60 }] } };
    const recent = { response: { total_count: 1, games: [{ appid: 620, name: 'Portal 2', playtime_2weeks: 30 }] } };
    for (const [key, body] of [
      [`/IPlayerService/GetOwnedGames/v1/?steamid=${id}&include_appinfo=1&include_played_free_games=1`, owned],
      [`/IPlayerService/GetRecentlyPlayedGames/v1/?steamid=${id}&count=0`, recent],
    ] as const) await db.query(`insert into steam_cache(key,body,expires_at) values($1,$2::jsonb,now()+interval '1 hour') on conflict(key) do update set body=excluded.body,expires_at=excluded.expires_at`, [key, JSON.stringify(body)]);
  }
  let aiCalls = 0, recommendationCalls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/ai') aiCalls++; if (new URL(request.url()).pathname === '/api/steam/personalized') recommendationCalls++; });
  await page.route(/steamstatic\.com.*header\.jpg/, route => route.abort()); // Covers remain usable when an image fails.
  await page.goto('/steam/recommend');
  await expect(page.getByRole('checkbox', { name: '혼자 할 수 있는 게임만' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '추천 멤버 1 (나)', exact: true })).toBeChecked();
  expect(recommendationCalls).toBe(0);
  await page.getByText('내 게임 취향 설정', { exact: true }).click();
  await page.getByRole('combobox', { name: '퍼즐 취향', exact: true }).selectOption('like');
  await page.getByRole('button', { name: '게임 취향 저장', exact: true }).click();
  await expect(page.getByText('게임 취향을 저장했어요. 다음 추천부터 반영해요.')).toBeVisible();
  await page.getByText('내 게임 취향 설정', { exact: true }).click();
  await page.getByRole('button', { name: '내 취향으로 추천받기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '나를 위한 게임', exact: true })).toBeVisible();
  await expect(page.locator('.personal-game-list').getByRole('heading', { name: 'Human Fall Flat', exact: true })).toBeVisible();
  await page.reload();
  await page.getByText('내 게임 취향 설정', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: '퍼즐 취향', exact: true })).toHaveValue('like');
  // 새로고침은 결과를 지우므로, 화면 크기별 확인과 대화 첨부 전에 다시 추천받는다.
  await page.getByText('내 게임 취향 설정', { exact: true }).click();
  await page.getByRole('button', { name: '내 취향으로 추천받기', exact: true }).click();
  await expect(page.locator('.personal-game-list').getByRole('heading', { name: 'Human Fall Flat', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.jaesuni-channel-feed').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `output/playwright/steam-taste-${width}.png`, fullPage: true });
    await page.locator('.personal-game-list > li').first().evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `output/playwright/steam-taste-results-${width}.png`, fullPage: true });
  }
  expect(aiCalls).toBe(0);
  // The new result projection hands verified mode limits to chat without AI.
  await page.getByRole('button', { name: '자료 붙여서 대화하기', exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.getByRole('button', { name: '참고 자료 1', exact: true }).last().click();
  await expect(page.getByRole('complementary', { name: '현재 참고 자료' })).toContainText('내 취향 Steam 추천');
  await expect(page.getByRole('complementary', { name: '현재 참고 자료' })).toContainText('온라인 플레이');
  expect(aiCalls).toBe(0);
  await page.getByRole('complementary', { name: '현재 참고 자료' }).getByText('멤버·취향 설정', { exact: true }).click();
  await page.getByRole('link', { name: '게임 취향 설정', exact: true }).click();
  await expect(page).toHaveURL(/\/steam\/recommend$/);
  await page.getByRole('link', { name: '재순이와 대화', exact: true }).last().click();
  await expect(page.locator('.chat-current-attachment')).toContainText('내 취향 Steam 추천');
  await page.getByRole('button', { name: '참고 자료 1', exact: true }).last().click();
  await page.getByRole('complementary', { name: '현재 참고 자료' }).getByText('멤버·취향 설정', { exact: true }).click();
  await page.getByRole('link', { name: '게임 취향 설정', exact: true }).click();
  await page.getByRole('heading', { name: '내 취향으로 게임 찾기', exact: true }).waitFor({ state: 'visible' });
  await expect(page.getByRole('radio', { name: '추천 멤버 1 (나)', exact: true })).toBeChecked();
  await page.getByText('내 게임 취향 설정', { exact: true }).click();
  await page.getByRole('combobox', { name: '퍼즐 취향', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/steam-taste-settings-mobile.png', fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '게임 취향 전체 삭제', exact: true }).click();
  await expect(page.getByText('게임 취향을 지웠어요.')).toBeVisible();
  expect((await (await context.request.get(`${BASE_URL}/api/steam/taste`)).json()).taste.likes).toEqual([]);
});

test('취향 조회 오류는 빈 설정과 구분하고 수동 재시도 뒤 연결 없음을 안내한다', async ({ page, context }) => {
  await loginAs(context, await createUser('taste_error', '추천 오류 친구'));
  await page.route('**/api/steam/taste', route => route.fulfill({ status: 503, json: { error: '취향 조회 실패' } }));
  await page.goto('/steam/recommend'); await expect(page.locator('.personal-recommendations').getByRole('alert')).toContainText('취향 조회 실패');
  await page.unroute('**/api/steam/taste'); await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByText('내 계정으로 연결된 Steam 멤버가 없어요.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '내 취향으로 추천받기', exact: true })).toBeDisabled();
});
