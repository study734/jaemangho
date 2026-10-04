import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

const STEAM_ID = '76561199900000001';

test.beforeEach(cleanup);
test.afterAll(async () => {
  await db.query(`delete from steam_members where steam_id = '${STEAM_ID}'`);
  await cleanup();
});

test('멤버 목록에서 프로필로 들어가 연결된 계정을 보고, 주인 없는 계정을 연결하고 해제한다', async ({ page, context }) => {
  const me = await createUser('people_me', 'E2E나');
  await createUser('people_friend', 'E2E친구');
  await db.query(`insert into members (id, game_name, tag_line, created_by, owner_id) values
    ('e2e_m_mine', 'E2E내롤', 'KR1', 'e2e_people_me', 'e2e_people_me'),
    ('e2e_m_free', 'E2E주인없음', 'KR1', 'e2e_people_me', null)`);
  await db.query(`insert into steam_members (steam_id, persona_name, created_by, owner_id) values ('${STEAM_ID}', 'E2E스팀', 'e2e_people_me', null)`);
  await loginAs(context, me);

  // 목록 -> 프로필
  await page.goto('/people');
  await expect(page.getByText('롤 1 · Steam 0').first()).toBeVisible();
  await page.getByRole('link', { name: /E2E나/ }).click();
  await expect(page).toHaveURL(/\/people\/e2e_people_me$/);
  await expect(page.getByText('E2E내롤#KR1')).toBeVisible();

  // 주인 없는 계정을 이 사람 것으로 연결 (롤, Steam)
  await expect(page.getByText('롤 · E2E주인없음#KR1')).toBeVisible();
  await page.getByText('롤 · E2E주인없음#KR1').locator('..').getByRole('button', { name: '이 사람 것으로' }).click();
  await expect(page.getByText('E2E주인없음#KR1').first()).toBeVisible();
  await expect.poll(async () => (await db.query(`select owner_id from members where id = 'e2e_m_free'`)).rows[0].owner_id).toBe('e2e_people_me');

  await page.getByText('Steam · E2E스팀').locator('..').getByRole('button', { name: '이 사람 것으로' }).click();
  await expect.poll(async () => (await db.query(`select owner_id from steam_members where steam_id = '${STEAM_ID}'`)).rows[0].owner_id).toBe('e2e_people_me');
  await expect(page.getByText('주인 없는 계정')).toHaveCount(0);

  // 연결 해제 -> 다시 주인 없음
  await page.getByText('E2E스팀').first().locator('xpath=ancestor::li[1]').getByRole('button', { name: '연결 해제' }).click();
  await expect.poll(async () => (await db.query(`select owner_id from steam_members where steam_id = '${STEAM_ID}'`)).rows[0].owner_id).toBeNull();
});

test('없는 멤버 프로필은 404', async ({ page, context }) => {
  await loginAs(context, await createUser('people_404', 'E2E404'));
  expect((await page.goto('/people/e2e_nobody'))?.status()).toBe(404);
});
