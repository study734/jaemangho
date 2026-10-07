import { cleanup, createUser, db, expect, loginAs, mockRiot, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('직접 등록과 편집은 같은 입력 규칙을 쓰고 편집 취소는 다른 소환사에 영향을 주지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('form_reuse', 'E2E폼재사용'));
  await page.route(/\/api\/riot\?/, route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/lol/squad');
  for (const name of ['E2E폼A', 'E2E폼B']) {
    await page.getByRole('button', { name: '소환사 추가' }).click();
    await page.getByLabel('소환사명', { exact: true }).fill(name);
    await page.getByLabel('태그라인', { exact: true }).fill('KR1');
    await page.getByRole('button', { name: /상세 정보 직접 입력/ }).click();
    await page.getByLabel('초기 티어', { exact: true }).selectOption('MASTER');
    await page.getByLabel('소환사 레벨', { exact: true }).fill('222');
    await page.getByLabel('리그 포인트 (LP)', { exact: true }).fill('88');
    await page.getByRole('button', { name: '직접 입력한 정보로 추가' }).click();
    await expect.poll(async () => (await db.query('select count(*)::int as n from members where game_name = $1', [name])).rows[0].n).toBe(1);
  }
  const first = page.locator('.card-base').filter({ has: page.getByRole('heading', { name: 'E2E폼A', exact: true }) });
  const second = page.locator('.card-base').filter({ has: page.getByRole('heading', { name: 'E2E폼B', exact: true }) });
  await expect(first.getByText('마스터', { exact: true })).toBeVisible();
  await expect(first.getByText('88 LP')).toBeVisible();
  await first.getByRole('button', { name: '정보 편집' }).click();
  await first.getByLabel('LP', { exact: true }).fill('999');
  await second.getByRole('button', { name: '정보 편집' }).click();
  await expect(first.getByRole('button', { name: '정보 편집' })).toBeVisible();
  await expect(second.getByLabel('LP', { exact: true })).toHaveValue('88');
  await second.getByRole('button', { name: '취소', exact: true }).click();
  await first.getByRole('button', { name: '정보 편집' }).click();
  await expect(first.getByLabel('LP', { exact: true })).toHaveValue('88');
  await first.getByLabel('LP', { exact: true }).fill('123');
  await first.getByLabel('승리', { exact: true }).fill('70');
  await first.getByRole('button', { name: '저장', exact: true }).click();
  await expect(first.getByText('123 LP')).toBeVisible();
  await expect(first.getByText('70승 50패')).toBeVisible();
  await expect(second.getByText('88 LP')).toBeVisible();
});

test('소환사를 검색해 추가하면 목록에 나오고, 새로고침해도 남고, 삭제하면 사라진다', async ({ page, context }) => {
  await loginAs(context, await createUser('roster', 'E2E등록자'));
  await mockRiot(page);
  page.on('dialog', (dialog) => dialog.accept()); // 삭제 확인 창

  await page.goto('/lol/squad');
  await page.getByRole('button', { name: '소환사 추가' }).click();
  await page.getByPlaceholder('예: Faker').fill('E2E소환사');
  await page.getByPlaceholder('예: KR1').fill('kr1');
  await page.getByLabel('태그라인', { exact: true }).press('Enter');

  // 검색 결과 미리보기 -> 추가 확정
  await expect(page.getByText('계정 확인 완료')).toBeVisible();
  await page.getByRole('button', { name: /이 소환사 추가하기/ }).click();
  await expect(page.getByRole('heading', { name: 'E2E소환사' }).first()).toBeVisible();

  // 서버(DB)에 저장되었고 등록자가 기록되었다
  await expect
    .poll(async () => (await db.query(`select created_by_name from members where game_name = 'E2E소환사'`)).rows[0]?.created_by_name)
    .toBe('E2E등록자');

  // 새로고침해도 DB에서 다시 불러와 남아 있다
  await page.reload();
  await expect(page.getByRole('heading', { name: 'E2E소환사' }).first()).toBeVisible();

  // 삭제
  await page.getByTitle('목록에서 삭제').first().click();
  await expect(page.getByRole('heading', { name: 'E2E소환사' })).toHaveCount(0);
  await expect
    .poll(async () => (await db.query(`select count(*)::int as n from members where game_name = 'E2E소환사'`)).rows[0].n)
    .toBe(0);
});

test('이미 있는 Riot ID를 다시 추가하려 하면 거부된다', async ({ page, context }) => {
  await loginAs(context, await createUser('dup', 'E2E중복'));
  await mockRiot(page);
  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    dialog.accept();
  });

  await page.goto('/lol/squad');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /^(소환사 추가|닫기)$/ }).click();
    await page.getByPlaceholder('예: Faker').fill('E2E소환사');
    await page.getByPlaceholder('예: KR1').fill('KR1');
    await page.getByRole('button', { name: /소환사 검색 및 검증/ }).click();
    await page.getByRole('button', { name: /이 소환사 추가하기/ }).click();
    await expect(page.getByRole('heading', { name: 'E2E소환사' }).first()).toBeVisible();
  }

  expect(messages).toContain('이미 목록에 있는 Riot ID입니다.');
  expect((await db.query(`select count(*)::int as n from members where game_name = 'E2E소환사'`)).rows[0].n).toBe(1);
});

test('존재하지 않는 Riot ID는 검색 단계에서 안내된다', async ({ page, context }) => {
  await loginAs(context, await createUser('nf', 'E2E없음'));
  await page.route(/\/api\/riot\?/, (route) => route.fulfill({ status: 404, json: {} }));

  await page.goto('/lol/squad');
  await page.getByRole('button', { name: '소환사 추가' }).click();
  await page.getByPlaceholder('예: Faker').fill('없는사람');
  await page.getByPlaceholder('예: KR1').fill('KR9');
  await page.getByRole('button', { name: /소환사 검색 및 검증/ }).click();
  await expect(page.getByText(/존재하지 않는 Riot ID입니다/)).toBeVisible();
});
