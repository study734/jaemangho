import { cleanup, createUser, db, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('운영 로그는 오류·경고·복구를 구분하고 수준별로 필터링한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ops_levels', 'E2E운영로그', 'admin'));
  const snapshot = await (await context.request.get('/api/admin/operations')).json();
  const at = new Date().toISOString();
  const alert = { firstSeen: at, resolvedAt: null, notificationError: null, active: true };
  await page.route('**/api/admin/operations', (route) => route.fulfill({ json: {
    ...snapshot, checkedAt: at, alerts: [
      { ...alert, key: 'riot.key', title: 'Riot 인증 오류', severity: 'critical' },
      { ...alert, key: 'chat.failed', title: '채팅 동기화 부분 완료', severity: 'warning' },
      { ...alert, key: 'chat.stale', title: '채팅 동기화 지연', severity: 'warning', active: false, resolvedAt: at },
    ],
  } }));
  await page.goto('/admin');
  const logs = page.getByRole('list', { name: '운영 로그', exact: true });
  await expect(logs.getByRole('listitem')).toHaveCount(3);
  await expect(logs.getByRole('listitem').nth(0)).toContainText('Error · 오류');
  await expect(logs.getByRole('listitem').nth(2)).toContainText('Info · 정보');
  await expect(logs).toContainText('이전 경고가 해소');
  await page.getByRole('button', { name: 'Warning · 경고 1', exact: true }).click();
  await expect(logs.getByRole('listitem')).toHaveCount(1);
  await expect(logs).toContainText('채팅 동기화 부분 완료');
  await page.getByRole('button', { name: 'Info · 정보 1', exact: true }).click();
  await expect(logs).toContainText('복구');
  await page.getByRole('button', { name: '전체 3', exact: true }).click();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(logs).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('운영 API는 관리자만 조회·조작할 수 있다', async ({ context }) => {
  expect((await context.request.get('/api/admin/operations')).status()).toBe(401);
  await loginAs(context, await createUser('ops_user', 'E2E일반사용자'));
  expect((await context.request.get('/api/admin/operations')).status()).toBe(403);
  expect((await context.request.post('/api/admin/operations?action=check')).status()).toBe(403);
});

test('운영 화면에서 점검·캐시 초기화·기간 선택·현황 내보내기와 작업 이력을 사용한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ops_admin', 'E2E운영자', 'admin'));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '운영 상태와 알림' })).toBeVisible();
  await page.getByRole('button', { name: '지금 점검' }).click();
  await expect(page.getByRole('status').filter({ hasText: '작업을 완료했습니다.' })).toBeVisible();

  await page.getByRole('tab', { name: '연동' }).click();
  await expect(page.getByRole('button', { name: '동기화 재실행' })).toBeDisabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Steam 캐시 비우기' }).click();

  await page.getByRole('tab', { name: '기록' }).click();
  await expect(page.getByRole('cell', { name: '운영 상태 점검', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Steam 캐시 비우기', exact: true }).first()).toBeVisible();

  await page.getByLabel('열람 통계 기간').selectOption('30');
  await expect(page.getByRole('heading', { name: '화면별 열람 (최근 30일)' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '통계를 불러오는 중입니다.' })).toHaveCount(0);
  expect((await context.request.get('/api/admin/operations?resource=views&days=8')).status()).toBe(400);
  expect((await context.request.get('/api/admin/operations?resource=views&end=2026-02-31')).status()).toBe(400);
  expect((await context.request.post('/api/admin/operations?action=sync')).status()).toBe(503);

  const exported = await context.request.get('/api/admin/operations?resource=export');
  expect(exported.status()).toBe(200);
  expect(exported.headers()['content-disposition']).toContain('attachment');
  const snapshot = await exported.json();
  expect(snapshot.operations.audit.some((a: { action: string }) => a.action === 'monitor.check')).toBe(true);
  expect(JSON.stringify(snapshot)).not.toContain('e2e_tok_ops_admin');
  expect((await db.query(`select result from ops_audit where actor_id = 'e2e_ops_admin' and action = 'snapshot.export' order by id desc limit 1`)).rows[0].result).toBe('success');
});
