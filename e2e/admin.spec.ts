import { cleanup, createUser, db, expect, loginAs, statusOf, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('관리자는 대시보드에서 접속자를 보고 차단/해제할 수 있고, 차단된 사용자는 즉시 쫓겨난다', async ({ page, browser, context }) => {
  const admin = await createUser('admin', 'E2E관리자', 'admin');
  const victim = await createUser('victim', 'E2E대상');
  await loginAs(context, admin);
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/lol');
  await page.getByRole('link', { name: '설정 · 관리자' }).click(); // 상단 주제 메뉴
  await page.getByRole('link', { name: '관리자', exact: true }).click(); // 좌측 상세 메뉴
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();

  // 접속자 목록: 관리자 배지, 디스코드 핸들
  await page.getByRole('tab', { name: '사용자' }).click();
  const adminRow = page.getByRole('row', { name: /E2E관리자/ });
  await expect(adminRow).toContainText('관리자');
  await expect(adminRow.getByRole('button')).toHaveCount(0); // 관리자는 차단 버튼이 없다
  const victimRow = page.getByRole('row', { name: /E2E대상/ });
  await expect(victimRow).toContainText('@victim');

  // 차단 대상 사용자는 이미 로그인해 있다
  const victimContext = await browser.newContext();
  await loginAs(victimContext, victim);
  const victimPage = await victimContext.newPage();
  await victimPage.goto('/lol');
  expect(await statusOf(victimPage, '/api/members')).toBe(200);

  // 차단
  await victimRow.getByRole('button', { name: '차단', exact: true }).click();
  await expect(victimRow).toContainText('차단됨');
  await expect(victimRow.getByRole('button', { name: '차단 해제' })).toBeVisible();

  // 차단된 사용자의 기존 세션이 즉시 끊긴다 (30초 기다리지 않는다)
  expect(await statusOf(victimPage, '/api/members')).toBe(401);
  await victimPage.goto('/lol');
  await expect(victimPage).toHaveURL(/\/login/);
  await victimContext.close();

  // 해제
  await victimRow.getByRole('button', { name: '차단 해제' }).click();
  await expect(victimRow).not.toContainText('차단됨');
});

test('관리자 화면은 등록 소환사 목록과 등록자, 시스템 상태를 보여준다', async ({ page, context }) => {
  const admin = await createUser('admin2', 'E2E관리자2', 'admin');
  await db.query(`insert into members (id, game_name, tag_line, created_by, created_by_name) values ('e2e_m1', 'E2E목록', 'KR1', $1, '무시됨')`, [admin.id]);
  await loginAs(context, admin);

  await page.goto('/admin');
  await expect(page.getByText('DB 사용량')).toBeVisible(); // 개요 탭
  await page.getByRole('tab', { name: '사용자' }).click();
  const row = page.getByRole('row', { name: /E2E목록#KR1/ });
  await expect(row).toContainText('E2E관리자2'); // 등록자 이름이 사용자 정보에서 해석된다
  await page.getByRole('tab', { name: '연동' }).click();
  await expect(page.getByRole('button', { name: '캐시 비우기', exact: true })).toBeVisible();
});

test('관리자가 등록 소환사를 삭제하면 목록에서 사라진다', async ({ page, context }) => {
  const admin = await createUser('admin3', 'E2E관리자3', 'admin');
  await db.query(`insert into members (id, game_name, tag_line, created_by) values ('e2e_m2', 'E2E삭제대상', 'KR2', $1)`, [admin.id]);
  await loginAs(context, admin);
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/admin');
  await page.getByRole('tab', { name: '사용자' }).click();
  const row = page.getByRole('row', { name: /E2E삭제대상#KR2/ });
  await row.getByRole('button', { name: '삭제' }).click();
  await expect(row).toHaveCount(0);
  expect((await db.query(`select count(*)::int as n from members where id = 'e2e_m2'`)).rows[0].n).toBe(0);
  expect((await db.query(`select result from ops_audit where actor_id = $1 and action = 'member.delete' and target = 'e2e_m2' order by id desc limit 1`, [admin.id])).rows[0].result).toBe('success');
});
