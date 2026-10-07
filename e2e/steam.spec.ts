import { cleanup, createUser, expect, loginAs, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('Steam 목록 실패는 빈 목록과 구분하고 비교 중에는 조건을 고정한다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_state', 'E2E비교상태'));
  let failed = true;
  await page.route('**/api/steam/members', route => route.fulfill(failed ? { status: 503, json: {} } : {
    json: [{ steamId: '76561190000000001', name: '철수', avatar: null }],
  }));
  let finish!: () => void;
  const responseReady = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/steam/games**', async route => {
    await responseReady;
    await route.fulfill({ json: { games: [{ appId: 730, name: 'Counter-Strike 2', totalMinutes: 60 }], excluded: [] } });
  });
  await page.goto('/steam');
  await expect(page.getByRole('alert').filter({ hasText: 'Steam 키가 설정되지 않았습니다.' })).toBeVisible();
  await expect(page.getByText('아직 등록된 사람이 없습니다.')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: '목록 다시 불러오기' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '비교하기 (1명)' }).click();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByLabel('찾을 게임 종류')).toBeDisabled();
  finish();
  await expect(page.getByText('비교한 사람: 철수')).toBeVisible();
  await expect(page.getByText('Counter-Strike 2')).toBeVisible();
  await page.getByRole('checkbox').uncheck();
  await expect(page.getByText('Counter-Strike 2')).toHaveCount(0);
});

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

test('Steam 추천은 2명 이상 선택하고 기준·근거를 보여주며 조건 변경 시 결과를 지운다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_recommend', 'E2E추천'));
  await page.route('**/api/steam/members', route => route.fulfill({ json: [
    { steamId: '76561190000000001', name: '철수', avatar: null },
    { steamId: '76561190000000002', name: '영희', avatar: null },
  ] }));
  let finish!: () => void;
  const responseReady = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/steam/recommendations**', async route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('ids')).toBe('76561190000000001,76561190000000002');
    expect(query.get('preference')).toBe('fresh');
    await responseReady;
    return route.fulfill({ json: { games: [{ appId: 620, name: 'Portal 2', totalMinutes: 120, playedBy: 2, beginnerCount: 0,
      minMinutes: 60, maxMinutes: 60, score: 78, reasons: ['선택한 2명 모두 보유', '모두 플레이 경험이 있어요'], support: 'coop' }],
      excluded: [], totalCommon: 50, checked: 40, unverified: 2 } });
  });
  await page.goto('/steam');
  await expect(page.getByRole('button', { name: '추천받기 (0명)' })).toBeDisabled();
  await page.getByRole('checkbox').nth(0).check();
  await expect(page.getByRole('button', { name: '추천받기 (1명)' })).toBeDisabled();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByLabel('오늘은 어떤 게임?').selectOption('fresh');
  await page.getByRole('button', { name: '추천받기 (2명)' }).click();
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  await expect(page.getByLabel('오늘은 어떤 게임?')).toBeDisabled();
  await expect(page.getByRole('button', { name: '추천 찾는 중...' })).toBeDisabled();
  finish();
  await expect(page.getByRole('heading', { name: '오늘 같이 할 게임' })).toBeVisible();
  await expect(page.getByText('선택한 2명 모두 보유', { exact: true })).toBeVisible();
  await expect(page.getByText('협동 지원 · 추천 점수 78')).toBeVisible();
  await expect(page.getByText(/스토어 정보를 확인하지 못한 2개/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portal 2 인원과 플레이 방식 확인' })).toHaveAttribute('href', 'https://store.steampowered.com/app/620/');
  await page.getByLabel('결과에서 게임 찾기').fill('없는 게임');
  await expect(page.getByText('검색한 이름과 일치하는 추천이 없습니다. 검색어를 바꿔 보세요.')).toBeVisible();
  await page.getByRole('button', { name: '지우기', exact: true }).click();
  await page.getByLabel('오늘은 어떤 게임?').selectOption('balanced');
  await expect(page.getByRole('heading', { name: '오늘 같이 할 게임' })).toHaveCount(0);
});

test('Steam 추천 API는 잘못된 인원·기준과 미등록 계정을 거부한다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_recommend_validation', 'E2E추천검증'));
  await page.goto('/steam');
  for (const query of [
    'ids=76561190000000001',
    'ids=76561190000000001,76561190000000001',
    'ids=invalid,76561190000000002',
    'ids=76561190000000001,76561190000000002&preference=invalid',
    'ids=76561190000000991,76561190000000992',
  ]) {
    const status = await page.evaluate(async query => (await fetch(`/api/steam/recommendations?${query}`)).status, query);
    expect(status, query).toBe(400);
  }
});

test('Steam 추천은 비공개 목록과 스토어 장애, 결과 없음 상태를 구분한다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_recommend_empty', 'E2E추천없음'));
  await page.route('**/api/steam/members', route => route.fulfill({ json: [
    { steamId: '76561190000000001', name: '철수', avatar: null },
    { steamId: '76561190000000002', name: '영희', avatar: null },
  ] }));
  let state: 'private' | 'unavailable' | 'empty' = 'private';
  await page.route('**/api/steam/recommendations**', route => route.fulfill({ json: {
    games: [], excluded: state === 'private' ? ['76561190000000002'] : [],
    totalCommon: state === 'unavailable' ? 2 : 0, checked: state === 'unavailable' ? 2 : 0, unverified: state === 'unavailable' ? 2 : 0,
  } }));
  await page.goto('/steam');
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button', { name: '추천받기 (2명)' }).click();
  await expect(page.getByText(/게임 목록을 확인할 수 없는 사람: 영희/)).toBeVisible();
  state = 'unavailable';
  await page.getByRole('button', { name: '추천받기 (2명)' }).click();
  await expect(page.getByText(/스토어 정보를 확인하지 못한 2개/)).toBeVisible();
  state = 'empty';
  await page.getByRole('button', { name: '추천받기 (2명)' }).click();
  await expect(page.getByText('선택한 모두가 가진 게임이 없어요. 멤버 선택을 바꿔 보세요.')).toBeVisible();
});

test('Steam 추천은 PC·전환점·모바일에서 긴 이름과 이미지 실패를 표시한다', async ({ page, context }) => {
  await loginAs(context, await createUser('steam_recommend_layout', 'E2E추천화면'));
  await page.route('**/api/steam/members', route => route.fulfill({ json: [
    { steamId: '76561190000000001', name: '아주긴이름을가진크루멤버철수', avatar: null },
    { steamId: '76561190000000002', name: '영희', avatar: null },
  ] }));
  await page.route('**/store_item_assets/**', route => route.abort());
  const gameName = '함께하는 아주 긴 이름의 협동 게임 Deluxe Edition';
  await page.route('**/api/steam/recommendations**', route => route.fulfill({ json: {
    games: [{ appId: 620, name: gameName, totalMinutes: 0, playedBy: 0, beginnerCount: 2, minMinutes: 0, maxMinutes: 0,
      score: 90, reasons: ['선택한 2명 모두 보유', '모두 아직 플레이하지 않은 게임'], support: 'coop' }],
    excluded: [], totalCommon: 1, checked: 1, unverified: 0,
  } }));
  await page.goto('/steam');
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button', { name: '추천받기 (2명)' }).click();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const section = page.getByRole('region', { name: '오늘 같이 할 게임' });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText('모두 아직 플레이하지 않은 게임')).toBeVisible();
    await expect(page.getByRole('link', { name: `${gameName} 인원과 플레이 방식 확인` })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/steam-recommend-${width}.png`, fullPage: true });
  }
});
