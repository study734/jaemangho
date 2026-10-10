import { cleanup, createUser, db, expect, loginAs, statusOf, test } from './fixtures';

const STEAM_ID = '76561193000000021';

test.beforeEach(cleanup);
test.afterEach(async () => { await db.query(`delete from steam_members where steam_id = $1`, [STEAM_ID]); });
test.afterAll(cleanup);

test('저장 국가 미확인 동안 수집 요청을 막고, 기존 요청의 중단·삭제를 본인이 실행한다', async ({ page, context }) => {
  const user = await createUser('steam_activity', 'E2E활동');
  await loginAs(context, user);
  await db.query(`insert into steam_members (steam_id, persona_name, owner_id) values ($1, 'E2E활동', $2)`, [STEAM_ID, user.id]);
  await db.query(`insert into steam_verified_accounts (steam_id, user_id) values ($1, $2)`, [STEAM_ID, user.id]);

  await page.goto('/steam');
  await expect(page.getByRole('heading', { name: '내 Steam 활동 기록 설정' })).toBeVisible();
  await expect(page.getByText('확인되지 않았습니다. 현재 수집 요청을 받을 수 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '주간 수집 요청' })).toHaveCount(0);
  expect(await statusOf(page, '/api/steam/activity', { method: 'POST', body: { steamId: STEAM_ID, noticeVersion: 'steam-activity-v1' } })).toBe(503);

  await db.query(`insert into steam_collection_requests
    (steam_id, requested_by, notice_version, storage_country, requested_at)
    values ($1, $2, 'old-test-notice', 'test-only', now())`, [STEAM_ID, user.id]);
  await page.reload();
  await page.getByRole('button', { name: '수집 중단' }).click();
  await expect(page.getByText('수집 중단됨')).toBeVisible();
  expect((await db.query(`select stopped_at is not null as stopped from steam_collection_requests where steam_id = $1`, [STEAM_ID])).rows[0].stopped).toBe(true);

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '기록 삭제' }).click();
  await expect(page.getByText('확인된 Steam 계정이 없습니다.')).toBeVisible();
  expect((await db.query(`select count(*)::int as n from steam_verified_accounts where steam_id = $1`, [STEAM_ID])).rows[0].n).toBe(0);
});
