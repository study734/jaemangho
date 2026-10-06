import { cleanup, createUser, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('챔피언 이미지가 실패해도 다른 챔피언을 보여주지 않고 로컬 대체 이미지를 쓴다', async ({ page, context }) => {
  await loginAs(context, await createUser('images', 'E2E이미지'));
  await mockRiot(page);
  // 기존 등록 흐름과 같은 데이터로 스몰더 숙련도를 표시한다.
  await page.route(/\/api\/riot\?.*champion-masteries/, (route) => route.fulfill({ json: [
    { championId: 901, championLevel: 7, championPoints: 125000, lastPlayTime: 1700000000000 },
  ] }));
  let championRequests = 0;
  await page.route('https://ddragon.leagueoflegends.com/cdn/**/img/champion/*.png', (route) => {
    championRequests++;
    return route.abort();
  });
  await page.goto('/lol/squad');
  await page.getByRole('button', { name: '소환사 추가' }).click();
  await page.getByPlaceholder('예: Faker').fill('E2E소환사');
  await page.getByPlaceholder('예: KR1').fill('KR1');
  await page.getByRole('button', { name: /소환사 검색 및 검증/ }).click();
  await page.getByRole('button', { name: /이 소환사 추가하기/ }).click();
  await expect(page.getByRole('heading', { name: 'E2E소환사' }).first()).toBeVisible();
  await page.getByRole('link', { name: '대시보드', exact: true }).click();
  const details = page.waitForResponse((response) => response.url().includes('champion-masteries'));
  await page.getByRole('row').filter({ hasText: 'E2E소환사' }).click();
  await details;
  await page.getByRole('button', { name: '상세 닫기' }).click();
  // 클라이언트 이동으로 방금 불러온 상세 상태를 유지한다.
  await page.getByRole('link', { name: '챔피언 숙련도', exact: true }).click();
  const images = page.getByRole('img', { name: 'Smolder (이미지 없음)', exact: true });
  await expect(images.first()).toHaveAttribute('src', '/riot-image-placeholder.svg');
  await expect.poll(() => images.first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('img[src*="Ezreal"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '챔피언 숙련도' })).toBeVisible();
  expect(championRequests).toBeGreaterThan(0);
});
