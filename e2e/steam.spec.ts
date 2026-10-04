import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

// Steam 호출은 서버가 하므로 브라우저의 /api/steam 요청을 가짜로 대체한다 (서버 쪽은 단위·통합 테스트가 다룬다)
test('Steam 사람을 추가하고 골라 공통 게임을 비교하면 결과와 비공개 안내가 보인다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam', 'E2E스팀'));
  page.on('dialog', (dialog) => dialog.accept());

  const members: { steamId: string; name: string; avatar: null }[] = [];
  await page.route('**/api/steam/members**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const m = { steamId: '76561190000000001', name: '철수', avatar: null };
      members.unshift(m);
      return route.fulfill({ json: m });
    }
    if (method === 'DELETE') {
      members.length = 0;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: members });
  });
  await page.route('**/api/steam/games**', (route) =>
    route.fulfill({ json: { games: [{ appId: 730, name: 'Counter-Strike 2', totalMinutes: 3000 }], excluded: ['76561190000000001'] } })
  );

  await page.goto('/steam');
  await expect(page.getByText('아직 등록된 사람이 없습니다.')).toBeVisible();

  await page.getByLabel('Steam 프로필').fill('chulsoo');
  await page.getByRole('button', { name: '추가' }).click();
  await expect(page.getByText('철수')).toBeVisible();

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /비교하기 \(1명\)/ }).click();
  await expect(page.getByText('Counter-Strike 2')).toBeVisible();
  await expect(page.getByText('50시간')).toBeVisible();
  await expect(page.getByText(/게임 목록이 비공개라 빠진 사람: 철수/)).toBeVisible();

  await page.getByRole('button', { name: '철수 삭제' }).click();
  await expect(page.getByText('아직 등록된 사람이 없습니다.')).toBeVisible();
});

test('Steam 키가 없어 서버가 503을 주면 안내 문구가 보인다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam503', 'E2E스팀2'));
  await page.route('**/api/steam/members', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { error: 'x' } }) : route.fulfill({ json: [] })
  );
  await page.goto('/steam');
  await page.getByLabel('Steam 프로필').fill('anyone');
  await page.getByRole('button', { name: '추가' }).click();
  await expect(page.getByText('Steam 키가 설정되지 않았습니다')).toBeVisible();
});
