import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

// intent/0005 R2·R3: 디스코드 게임추천 준비 화면(/connect/steam).
const STEAM_ID = '76561193000000051';
test.beforeEach(cleanup);
test.afterEach(async () => { await db.query('delete from steam_members where steam_id=$1', [STEAM_ID]); });
test.afterAll(cleanup);

const noOverflow = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('로그인 전에는 이 화면에서 디스코드 로그인을 시작한다', async ({ page }) => {
  await page.goto('/connect/steam');
  await expect(page.getByRole('heading', { name: '게임추천 준비' })).toBeVisible();
  await expect(page.getByRole('button', { name: '디스코드로 로그인' })).toBeVisible();
  await expect(page.getByText('이용 동의', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'output/playwright/connect-steam-anonymous.png', fullPage: true });
});

test('Steam 연결 → 이용 동의 → 디스코드로 돌아가기를 한 화면에서 끝낸다', async ({ page, context }) => {
  const user = await createUser('connect', '준비하는 친구');
  await loginAs(context, user, false);
  await page.goto('/connect/steam?steam-link=failed');
  await expect(page.getByRole('status')).toContainText('본인 확인을 마치지 못했어요');
  const verify = page.getByRole('link', { name: 'Steam으로 본인 확인' });
  await expect(verify).toHaveAttribute('href', '/api/steam/activity/start?from=connect');
  await expect(page.getByText('사용하는 데이터')).toBeVisible();
  await expect(page.getByRole('link', { name: '디스코드 열기' })).toHaveCount(0);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 740 : 1000 });
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({ path: `output/playwright/connect-steam-start-${width}.png`, fullPage: true });
  }

  await page.getByRole('button', { name: '동의하기' }).click();
  await expect(page.getByRole('link', { name: 'Steam 데이터 안내 자세히 보기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /동의/ })).toHaveCount(0);
  await expect.poll(async () => (await db.query('select 1 from steam_feature_consents where user_id=$1 and revoked_at is null', [user.id])).rowCount).toBe(1);

  await db.query(`insert into steam_members (steam_id, persona_name, owner_id) values ($1, 'E2E 스팀', $2)`, [STEAM_ID, user.id]);
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByText('E2E 스팀')).toBeVisible();
  await expect(page.getByText('준비가 끝났어요')).toBeVisible();
  await expect(page.getByRole('link', { name: '디스코드 열기' })).toHaveAttribute('href', 'https://discord.com/channels/100000000000000002');
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 740 : 1000 });
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({ path: `output/playwright/connect-steam-done-${width}.png`, fullPage: true });
  }
});

test('웹 동의 창은 서버가 준 같은 고지 문구를 보여 준다', async ({ page, context }) => {
  await loginAs(context, await createUser('connect_gate', '동의 전'), false);
  await page.goto('/steam');
  const modal = page.getByRole('dialog', { name: 'Steam 공통 게임 이용 동의' });
  await expect(modal.getByText('사용하는 데이터')).toBeVisible();
  await expect(modal.getByText('저장 국가')).toBeVisible();
});
