import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('일정과 리딤코드를 올리고, 남의 글은 지울 수 없으며, 모바일에서 넘치지 않는다', async ({ page, context }) => {
  const me = await createUser('notice', 'E2E올리는이');
  await loginAs(context, me);
  await page.goto('/play/schedule');
  await expect(page.locator('.channel-sidebar').getByRole('link', { name: '일정 · 리딤코드' })).toHaveAttribute('aria-current', 'page');

  const start = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel('게임 이름').fill('E2E게임');
  await page.getByLabel('제목').fill('여름 이벤트');
  await page.getByLabel('시작', { exact: false }).first().fill(start);
  await page.getByRole('button', { name: '올리기' }).click();
  await expect(page.getByText('E2E게임 · 여름 이벤트')).toBeVisible();

  await page.getByRole('radio', { name: '리딤코드' }).click();
  await page.getByLabel('게임 이름').fill('E2E게임');
  await page.getByLabel('제목').fill('출시 보상');
  await page.getByLabel('코드', { exact: true }).fill('E2ECODE123');
  await page.getByRole('button', { name: '올리기' }).click();
  await expect(page.getByText('E2ECODE123')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 다른 멤버에게는 삭제 버튼이 없다. 작성자·관리자 권한은 game-notices.integration.test.ts가 검증한다.
  const other = await createUser('notice2', 'E2E구경꾼');
  await context.clearCookies();
  await loginAs(context, other);
  await page.goto('/play/schedule');
  await expect(page.getByText('E2ECODE123')).toBeVisible();
  await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(0);

  // 작성자는 지울 수 있다.
  await context.clearCookies();
  await loginAs(context, me);
  await page.goto('/play/schedule');
  await page.getByRole('button', { name: '삭제' }).first().click();
  await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(1);
});
