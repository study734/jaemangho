import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('홈 채널에서 게임 찾기로 이동한다', async ({ page, context }) => {
  await loginAs(context, await createUser('home', 'E2E홈'));
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '주제' }).getByRole('link', { name: '홈', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('E2E홈님, 멤버만 고르면 시작할 수 있어요.')).toBeVisible();
  await expect(page.locator('aside.detail-sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '롤' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steam 공통 게임 찾기' })).toBeVisible();
  await page.getByRole('link', { name: '같이 할 게임 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
});

test('한 서버 안에서 카테고리와 채널 목록을 유지하고 선택한 채널만 바꾼다', async ({ page, context }) => {
  await loginAs(context, await createUser('nav', 'E2E메뉴'));
  await page.goto('/lol');
  const side = page.locator('.channel-sidebar');
  const servers = page.getByRole('navigation', { name: '서버 목록' });
  await expect(servers.getByRole('link')).toHaveCount(1);
  await expect(servers.getByRole('link', { name: '재망호 서버' })).toHaveAttribute('aria-current', 'true');
  const channels = await side.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  await expect(side.getByRole('link', { name: '대시보드', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(side.getByText('요약 정보')).toBeVisible();

  // 카테고리는 주소를 바꾸지 않고 키보드로 접고 펼친다.
  const lolCategory = side.locator('.channel-category').filter({ has: page.locator('summary', { hasText: '롤' }) });
  await lolCategory.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(lolCategory.getByRole('link', { name: '소환사 관리' })).toBeHidden();
  await expect(page).toHaveURL(/\/lol$/);

  await side.getByRole('link', { name: 'Steam 공통 게임', exact: true }).click();
  await expect(page).toHaveURL(/\/steam$/);
  await expect(side.getByRole('link', { name: 'Steam 공통 게임' })).toHaveAttribute('aria-current', 'page');
  await expect(lolCategory.locator('a[href="/lol"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(lolCategory.getByRole('link', { name: '소환사 관리' })).toBeHidden();
  expect(await side.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(channels);
  await expect(side.getByText('요약 정보')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /강제 동기화/ })).toHaveCount(0);
  await lolCategory.locator('summary').click();
  await expect(lolCategory.getByRole('link', { name: '소환사 관리' })).toBeVisible();

  await side.getByRole('link', { name: '시상식', exact: true }).click();
  await expect(page).toHaveURL(/\/community\/awards$/);
  await expect(side.getByRole('link', { name: '시상식', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(servers.getByRole('link', { name: '재망호 서버' })).toHaveAttribute('aria-current', 'true');
  await page.locator('.channel-user').getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사용자 설정' })).toBeVisible();
  await expect(page).toHaveURL(/\/community\/awards$/);
  await expect(side.getByRole('link', { name: '관리자', exact: true })).toHaveCount(0);
});
