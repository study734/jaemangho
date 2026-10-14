import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('같은 경기를 두 소환사에서 조회해도 실제 듀오를 한 경기로 표시한다', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await loginAs(context, await createUser('synergy_debug', '시너지 친구'));
  await db.query(`insert into members (id, game_name, tag_line) values
    ('e2e_synergy_a', 'E2E시너지A', 'KR1'), ('e2e_synergy_b', 'E2E시너지B', 'KR1')`);
  await mockRiot(page);
  await page.route(/\/api\/riot\?/, route => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? '';
    if (path.startsWith('/riot/account/')) {
      const first = decodeURIComponent(path).includes('E2E시너지A');
      return route.fulfill({ json: { puuid: first ? 'SYNERGY_A' : 'SYNERGY_B', gameName: first ? 'E2E시너지A' : 'E2E시너지B', tagLine: 'KR1' } });
    }
    if (path.endsWith('/ids')) return route.fulfill({ json: ['KR_SYNERGY_TEST_1'] });
    if (path.endsWith('/matches/KR_SYNERGY_TEST_1')) return route.fulfill({ json: { info: {
      gameCreation: Date.now(), gameDuration: 1200, participants: ['A', 'B'].map(letter => ({
        puuid: `SYNERGY_${letter}`, riotIdGameName: `E2E시너지${letter}`, riotIdTagline: 'KR1',
        championName: 'Ahri', championId: 103, win: true, kills: 3, deaths: 2, assists: 5,
      })),
    } } });
    if (path.includes('/champion-masteries/')) return route.fulfill({ json: [{ championId: 103, championLevel: 7, championPoints: 1000, lastPlayTime: Date.now() - 60000 }] });
    return route.fallback();
  });
  await page.goto('/lol');
  for (const letter of ['A', 'B']) {
    await page.getByRole('button', { name: `E2E시너지${letter}#KR1 상세 보기` }).click();
    await expect(page.getByRole('dialog').getByText('4.00')).toBeVisible();
    await page.getByRole('button', { name: '상세 닫기' }).click();
  }
  await page.getByRole('link', { name: '듀오 시너지 분석', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E시너지A#KR1 & E2E시너지B#KR1' })).toBeVisible();
  await expect(page.getByText('1판 1승 0패')).toBeVisible();
  await mkdir('output/playwright', { recursive: true });
  for (const width of [1504, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'E2E시너지A#KR1 & E2E시너지B#KR1' })).toBeVisible();
    await page.screenshot({ path: `output/playwright/synergy-${width}.png` });
  }
  await page.getByRole('link', { name: '챔피언 숙련도', exact: true }).click();
  await expect(page.getByText('통합 숙련도 리더보드')).toBeVisible();
  await expect(page.getByText('Ahri').first()).toBeVisible();
  for (const width of [1504, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `output/playwright/mastery-${width}.png` });
  }
  expect(errors).toEqual([]);
});
