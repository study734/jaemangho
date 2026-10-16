import { cleanup, createUser, db, expect, loginAs, statusOf, test } from './fixtures';

const STEAM_ID = '76561193000000021';
test.beforeEach(cleanup);
test.afterEach(async () => { await db.query('delete from steam_members where steam_id=$1', [STEAM_ID]); });
test.afterAll(cleanup);

test('좌측 Steam 진입은 필수 동의 모달을 띄우고 Escape·API 호출로 우회할 수 없다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_gate', '동의 전 사용자'), false);
  let memberReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/steam/members') memberReads++; });
  await page.goto('/');
  await page.getByRole('link', { name: 'Steam 공통 게임', exact: true }).first().click();
  const modal = page.getByRole('dialog', { name: 'Steam 공통 게임 이용 동의' });
  await expect(modal).toBeVisible();
  expect(memberReads).toBe(0);
  expect((await context.request.post('/api/steam/consent', { headers: { origin: new URL(page.url()).origin }, data: { accepted: false, noticeVersion: 'steam-common-v1' } })).status()).toBe(400);
  expect((await context.request.post('/api/steam/consent', { headers: { origin: 'https://other.invalid' }, data: { accepted: true, noticeVersion: 'steam-common-v1' } })).status()).toBe(403);
  await page.keyboard.press('Escape'); await expect(modal).toBeVisible();
  await page.mouse.click(2, 2); await expect(modal).toBeVisible();
  for (const path of ['/api/steam/members', '/api/steam/games?ids=76561190000000001', '/api/steam/recommendations?ids=76561190000000001,76561190000000002', '/api/steam/taste']) expect(await statusOf(page, path)).toBe(403);
  await page.getByRole('link', { name: '동의하지 않고 나가기' }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.goto('/steam'); await expect(modal).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 740 : 1000 });
    await expect(modal.getByRole('heading', { name: 'Steam 공통 게임 이용 동의' })).toBeInViewport();
    expect(await modal.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/steam-consent-${width}.png`, fullPage: true });
  }
  await page.route('**/api/steam/consent', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, json: {} }) : route.continue());
  await modal.getByRole('button', { name: '동의하고 Steam 공통 게임 사용' }).click();
  await expect(modal.getByRole('alert')).toContainText('동의를 저장하지 못했어요.');
  await expect(page.getByLabel('Steam 프로필')).toHaveCount(0);
  await page.unroute('**/api/steam/consent');
  await modal.getByRole('button', { name: '동의하고 Steam 공통 게임 사용' }).click();
  await expect(modal).toHaveCount(0); await expect(page.getByLabel('Steam 프로필')).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Steam 프로필')).toBeVisible(); await expect(modal).toHaveCount(0);
  await page.getByText('내 추천 데이터·취향 설정', { exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Steam 기능 동의 철회' }).click();
  await expect(modal).toBeVisible();
  expect(await statusOf(page, '/api/steam/members')).toBe(403);
});

test('필수 동의 후 확인된 내 계정만 미리 준비하고 중단·삭제한다', async ({ page, context }) => {
  const user = await createUser('steam_activity', 'E2E활동');
  await loginAs(context, user, false);
  await db.query(`insert into steam_members(steam_id,persona_name,owner_id) values($1,'E2E활동',$2)`, [STEAM_ID, user.id]);
  await db.query(`insert into steam_verified_accounts(steam_id,user_id) values($1,$2)`, [STEAM_ID, user.id]);
  await db.query(`insert into steam_cache(key,body,expires_at) values($1,$2::jsonb,now()+interval '1 hour') on conflict(key) do update set body=excluded.body,expires_at=excluded.expires_at`, [
    `/IPlayerService/GetOwnedGames/v1/?steamid=${STEAM_ID}&include_appinfo=1&include_played_free_games=1`, JSON.stringify({ response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: 240 }] } }),
  ]);
  await page.goto('/steam');
  expect((await db.query('select count(*)::int as n from steam_collection_requests where steam_id=$1', [STEAM_ID])).rows[0].n).toBe(0);
  await page.getByRole('button', { name: '동의하고 Steam 공통 게임 사용' }).click();
  await expect.poll(async () => (await db.query('select count(*)::int as n from steam_game_totals where steam_id=$1', [STEAM_ID])).rows[0].n).toBe(1);
  await page.getByText('내 추천 데이터·취향 설정', { exact: true }).click();
  await page.getByRole('button', { name: '수집 중단', exact: true }).click();
  await expect(page.getByText('수집 중단됨')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '기록 삭제', exact: true }).click();
  await expect(page.getByText(/확인된 Steam 계정이 없습니다/)).toBeVisible();
  expect((await db.query('select count(*)::int as n from steam_game_totals where steam_id=$1', [STEAM_ID])).rows[0].n).toBe(0);
});
