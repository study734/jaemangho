import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('상단 메뉴바로 주제를 바꾸면 좌측 상세 메뉴가 그 주제의 것으로 바뀐다', async ({ page, context }) => {
  await loginAs(context, await createUser('nav', 'E2E메뉴'));
  await page.goto('/lol');
  const side = page.locator('aside');
  const top = page.getByRole('navigation', { name: '주제' });

  // 롤: 롤 상세 메뉴와 요약 정보
  await expect(top.getByRole('link', { name: '롤', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(side.getByRole('link', { name: '소환사 관리' })).toBeVisible();
  await expect(side.getByText('요약 정보')).toBeVisible();

  // Steam: Steam 메뉴만, 롤 요약은 없다
  await top.getByRole('link', { name: 'Steam', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
  await expect(side.getByRole('link', { name: 'Steam 공통 게임' })).toBeVisible();
  await expect(side.getByRole('link', { name: '소환사 관리' })).toHaveCount(0);
  await expect(side.getByText('요약 정보')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /강제 동기화/ })).toHaveCount(0);

  // 설정: 일반 사용자에게는 관리자 메뉴가 없다
  await top.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL(/\/lol\/settings$/);
  await expect(top.getByRole('link', { name: '설정', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(side.getByRole('link', { name: '관리자' })).toHaveCount(0);
});
