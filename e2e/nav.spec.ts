import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('홈 채널에서 게임 찾기로 이동한다', async ({ page, context }) => {
  await loginAs(context, await createUser('home', 'E2E홈'));
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('link', { name: /^홈/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('E2E홈님, 멤버만 고르면 시작할 수 있어요.')).toBeVisible();
  await expect(page.locator('aside.detail-sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '롤' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steam 공통 게임 찾기' })).toBeVisible();
  await page.getByRole('link', { name: '같이 할 게임 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
});

test('상단 탭과 하위 메뉴가 현재 위치만 바꾸고 요약·설정은 알맞은 곳에서 보인다', async ({ page, context }) => {
  await loginAs(context, await createUser('nav', 'E2E메뉴'));
  await page.goto('/lol');
  const topics = page.getByRole('navigation', { name: '주제', exact: true });
  const lolMenu = page.getByRole('navigation', { name: '롤 상세 메뉴' });
  await expect(topics.getByRole('link')).toHaveCount(5);
  await expect(topics.getByRole('link', { name: '롤', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(lolMenu.getByRole('link', { name: '대시보드', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('요약 정보')).toBeVisible();

  await topics.getByRole('link', { name: 'Steam', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
  await expect(topics.getByRole('link', { name: 'Steam', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(topics.getByRole('link', { name: '롤', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('요약 정보')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /강제 동기화/ })).toHaveCount(0);

  await topics.getByRole('link', { name: '우리 기록', exact: true }).click();
  await expect(page).toHaveURL(/\/memories$/);
  await page.getByRole('navigation', { name: '우리 기록 상세 메뉴' }).getByRole('link', { name: '시상식', exact: true }).click();
  await expect(page).toHaveURL(/\/community\/awards$/);
  await expect(page.getByRole('navigation', { name: '우리 기록 상세 메뉴' }).getByRole('link', { name: '시상식', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(topics.getByRole('link', { name: '우리 기록', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('banner').getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사용자 설정' })).toBeVisible();
  await expect(page).toHaveURL(/\/community\/awards$/);
  await expect(page.getByRole('banner').getByRole('link', { name: '관리자', exact: true })).toHaveCount(0);
});
