import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('홈은 사이드바 없이 주제 카드를 보여주고, 카드로 각 주제에 들어간다', async ({ page, context }) => {
  await loginAs(context, await createUser('home', 'E2E홈'));
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '주제' }).getByRole('link', { name: '홈', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('E2E홈님, 멤버만 고르면 시작할 수 있어요.')).toBeVisible();
  await expect(page.locator('aside:not(.home-action-stack)')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '롤' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steam 공통 게임 찾기' })).toBeVisible();
  await page.getByRole('link', { name: '같이 할 게임 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
});

test('상단 메뉴바로 주제를 바꾸면 좌측 상세 메뉴가 그 주제의 것으로 바뀐다', async ({ page, context }) => {
  await loginAs(context, await createUser('nav', 'E2E메뉴'));
  await page.goto('/lol');
  const side = page.locator('aside');
  const top = page.getByRole('navigation', { name: '주제' });

  // 롤: 롤 상세 메뉴와 요약 정보
  await expect(top.getByRole('link', { name: '같이 놀기', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(side.getByRole('link', { name: '소환사 관리' })).toBeVisible();
  await expect(side.getByText('요약 정보')).toBeVisible();

  // Steam: Steam 메뉴만, 롤 요약은 없다
  await top.getByRole('link', { name: '같이 놀기', exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole('main').getByRole('link', { name: /Steam 공통 게임/ }).click();
  await expect(page).toHaveURL(/\/steam$/);
  await expect(side.getByRole('link', { name: 'Steam 공통 게임' })).toBeVisible();
  await expect(side.getByRole('link', { name: '소환사 관리' })).toHaveCount(0);
  await expect(side.getByText('요약 정보')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /강제 동기화/ })).toHaveCount(0);

  // 설정: 일반 사용자에게는 관리자 메뉴가 없다
  await page.getByRole('banner').getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL(/\/lol\/settings$/);
  await expect(page.getByRole('banner').getByRole('link', { name: '설정', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(side.getByRole('link', { name: '관리자' })).toHaveCount(0);
});
