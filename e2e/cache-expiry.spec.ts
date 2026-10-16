import { cleanup, createUser, db, expect, loginAs, seedDiscovery, test } from './fixtures';
import { BASE_URL } from './env';
import { setHomeCacheAge } from './cache-age';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('fixture 정리는 이전 DB 데이터와 홈 캐시를 함께 격리한다', async ({ page, context, browser }) => {
  await loginAs(context, await createUser('cache_isolation_before', '캐시 격리 이전'));
  await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
    values ('e2e_cache_isolation_before', 'e2e_cache_channel', 'e2e_cache_author', '이전 테스트', now(), 3)`);
  await page.goto('/');
  await expect(page.getByRole('link', { name: '이전 테스트님의 메시지 보러 가기' })).toBeVisible();

  // 이전 테스트가 정리를 놓친 상태를 재현한다. 파일 실행 순서에 의존하지 않고 같은 경계를 검사한다.
  await page.close(); // 이전 세션의 폴링 요청이 다음 테스트의 쿠키를 지우지 않게 한다.
  await cleanup();
  expect((await db.query(`select count(*)::int as n from chat_messages where id = 'e2e_cache_isolation_before'`)).rows[0].n).toBe(0);
  await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
    values ('e2e_cache_isolation_after', 'e2e_cache_channel', 'e2e_cache_author', '다음 테스트', now(), 3)`);
  const nextContext = await browser.newContext({ baseURL: BASE_URL });
  try {
    await loginAs(nextContext, await createUser('cache_isolation_after', '캐시 격리 다음'));
    const nextPage = await nextContext.newPage();
    await nextPage.goto('/');
    await expect(nextPage.getByRole('link', { name: '다음 테스트님의 메시지 보러 가기' })).toBeVisible();
    await expect(nextPage.getByRole('link', { name: '이전 테스트님의 메시지 보러 가기' })).toHaveCount(0);
  } finally {
    await nextContext.close();
  }
});

test('홈 집계는 60초 TTL을 유지하고 캐시 나이에 따라 재사용·만료·갱신한다', async ({ page, context }) => {
  const user = await createUser('cache_ttl', '캐시 검증 친구');
  await loginAs(context, user);
  await seedDiscovery(user);
  await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
    values ('e2e_cache_ttl_message', 'e2e_cache_ttl_channel', 'e2e_cache_ttl_author', '캐시 이전', now(), 3)`);
  await page.goto('/');
  const oldMessage = page.getByRole('link', { name: '캐시 이전님의 메시지 보러 가기' });
  const newMessage = page.getByRole('link', { name: '캐시 갱신님의 메시지 보러 가기' });
  await expect(oldMessage).toBeVisible();
  const deck = page.getByRole('region', { name: '오늘은 무슨 일이 있었을까?' });
  await expect(deck.getByRole('button', { name: '4번째 발견' })).toHaveCount(1);
  await db.query(`update chat_messages set author_name = '캐시 갱신' where id = 'e2e_cache_ttl_message'`);
  await db.query(`update chat_awards set value = 24 where author_id = 'e2e_discovery_author_0'`);
  await db.query(`update chat_highlights set reactions = 9 where id = 'e2e_discovery_highlight'`);
  await db.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at, reactions)
    select 'e2e_discovery_current_' || lpad(n::text, 2, '0'), 'e2e_discovery_channel', 'e2e_discovery_author_' || n % 4,
    '항해 친구', (select created_at from chat_messages where id = 'e2e_discovery_current_00') + n * interval '1 second', 0
    from generate_series(40, 79) n`);

  // 채팅·칭호·개념글·순간 집계를 함께 검사하여 화면 테스트가 맡던 캐시 갱신 범위를 유지한다.
  async function reveal() {
    const toggle = deck.locator('button[aria-controls]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  async function snapshot() {
    await page.reload();
    await reveal();
    const awards = await deck.locator('.discovery-art-caption').textContent();
    await deck.getByRole('button', { name: '다음 발견' }).click();
    await reveal();
    const highlights = await deck.getByText('반응 9개에 답글 3개.').count();
    await deck.getByRole('button', { name: '다음 발견' }).click();
    await reveal();
    const moments = await deck.getByRole('img', { name: '평소 중앙값 12개, 이 순간 80개' }).count();
    return { chat: await newMessage.count(), awards, highlights, moments };
  }
  await page.reload();
  await expect(oldMessage).toBeVisible();
  await expect(newMessage).toHaveCount(0);
  expect(await snapshot()).toEqual({ chat: 0, awards: '12 새벽 메시지', highlights: 0, moments: 0 });

  // 서버가 읽는 캐시 파일의 나이만 바꾼다. 실제 TTL·내용·갱신 로직은 유지한다.
  // 파일의 60초 TTL도 확인하므로 TTL 단축·연장이나 캐시 제거를 놓치지 않는다.
  await setHomeCacheAge(55);
  // Read all six entries in one navigation. A second reload after UI checks
  // can cross the remaining five seconds and correctly observe expired data.
  expect(await snapshot()).toEqual({ chat: 0, awards: '12 새벽 메시지', highlights: 0, moments: 0 });
  await expect(oldMessage).toBeVisible();
  await expect(newMessage).toHaveCount(0);
  // 만료 직후의 첫 응답은 이전 값이어도 되지만, 백그라운드 갱신 후에는 새 값이 나와야 한다.
  await setHomeCacheAge(65);
  await expect.poll(snapshot, { timeout: 10_000, intervals: [100, 250, 500] }).toEqual({ chat: 1, awards: '24 새벽 메시지', highlights: 1, moments: 1 });
  await expect(oldMessage).toHaveCount(0);
  await expect(newMessage).toHaveAttribute('href', /e2e_cache_ttl_message$/);
});
