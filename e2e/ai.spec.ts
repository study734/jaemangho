import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, seedDiscovery, statusOf, test } from './fixtures';

test.beforeEach(async () => { await cleanup(); await db.query("delete from steam_members where steam_id in ('76561190000000001','76561190000000002')"); });
test.afterAll(async () => { await cleanup(); await db.query("delete from steam_members where steam_id in ('76561190000000001','76561190000000002')"); });
const answer = (text: string) => ({ answer: text, model: 'fixture', truncated: false });

test('AI API는 로그인 보호와 미설정 안내를 유지한다', async ({ page, context }) => {
  await page.goto('/login');
  expect(await statusOf(page, '/api/ai', { method: 'POST', body: { context: { topic: 'general' } } })).toBe(401);
  await loginAs(context, await createUser('ai_config', 'E2E AI 설정'));
  expect(await statusOf(page, '/api/ai', { method: 'POST', body: { context: { topic: 'general' } } })).toBe(503);
  // 키가 없으면 대화방은 보이되 재순이 말투로 이유를 알린다. 입력은 막지 않는다.
  await page.goto('/chat');
  await expect(page.getByRole('status').filter({ hasText: '재순이는 잠깐 쉬는 중이야' })).toContainText('API 키가 필요한데');
  await expect(page.getByRole('img', { name: '재망호 막내 재순이가 ‘현재 사용할 수 없어요’ 팻말을 들고 있는 모습' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '재순이에게 메시지' })).toBeEnabled();
  // 그림이 실패해도 안내 문구와 입력은 그대로 쓸 수 있다.
  await page.route('**/images/jaesuni-resting.webp', route => route.abort());
  await page.goto('/chat');
  await expect(page.getByRole('status').filter({ hasText: '재순이는 잠깐 쉬는 중이야' })).toContainText('API 키가 필요한데');
  await expect(page.getByRole('img', { name: '재망호 막내 재순이가 ‘현재 사용할 수 없어요’ 팻말을 들고 있는 모습' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '재순이에게 메시지' })).toBeEnabled();
});

test('질문 예시는 전송 없이 초안을 채우고 여러 턴을 실제 요청에 포함한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_chat', '게임친구'));
  const requests: { question: string; history: { role: string; content: string }[] }[] = [];
  await page.route('**/api/ai', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: answer(requests.length === 1 ? '오늘은 가볍게 할까, 승부를 볼까?' : '한 시간 정도 가볍게 할 게임을 찾는 거지? 멤버를 골라 자료를 붙여 줘.') });
  });
  await page.goto('/chat');
  await expect(page.getByText('나만 보는 대화', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '오늘 같이 할 게임 고르자' }).click();
  const input = page.getByRole('textbox', { name: '재순이에게 메시지' });
  await expect(input).toHaveValue('오늘 같이 할 게임 고르자');
  await expect(input).toBeFocused();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toContainText('가볍게 할까');
  await expect(page.getByRole('group', { name: '대화 시작 예시' })).toHaveCount(0);
  await input.fill('가볍게 한 시간');
  await input.press('Enter');
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toHaveCount(2);
  expect(requests[1]).toMatchObject({ question: '가볍게 한 시간', history: [
    { role: 'user', content: '오늘 같이 할 게임 고르자' }, { role: 'assistant', content: '오늘은 가볍게 할까, 승부를 볼까?' },
  ] });
  await input.fill('다음 질문 초안');
  await page.getByRole('navigation', { name: '주제' }).getByRole('link', { name: 'Steam', exact: true }).click();
  await page.getByRole('link', { name: '재순이와 대화', exact: true }).first().click();
  await expect(input).toHaveValue('다음 질문 초안');
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toHaveCount(2);
  await page.getByRole('button', { name: '새 대화', exact: true }).click();
  await page.getByRole('button', { name: '계속 대화' }).click();
  await expect(input).toHaveValue('다음 질문 초안');
  await page.getByRole('button', { name: '새 대화', exact: true }).click();
  await page.getByRole('button', { name: '지우고 시작' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(input).toHaveValue('');
  await input.fill('새 질문');
  await input.press('Shift+Enter');
  expect(requests).toHaveLength(2);
  await expect(input).toHaveValue('새 질문\n');
  await input.press('Enter');
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toHaveCount(1);
  expect(requests[2].history).toEqual([]);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(0);
});

async function steamFixture(page: import('@playwright/test').Page) {
  await page.route('**/api/steam/members', route => route.fulfill({ json: [{ steamId: '76561190000000001', name: '비공개닉네임', avatar: null }] }));
  await page.route('**/api/steam/games**', route => route.fulfill({ json: { games: [{ appId: 620, name: 'Portal 2', totalMinutes: 60 }, { appId: 440, name: 'Team Fortress 2', totalMinutes: 120 }], excluded: [] } }));
  await page.goto('/steam');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '비교하기 (1명)' }).click();
  await page.getByRole('button', { name: '자료 붙여서 대화하기' }).click();
}

test('Steam 스냅샷은 호출 없이 첨부하고 닉네임·ID를 전송하지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_steam', 'E2E AI Steam'));
  const requests: { context: { topic: string }; history: unknown[] }[] = [];
  await page.route('**/api/ai', route => {
    expect(route.request().postData()).not.toContain('76561190000000001');
    expect(route.request().postData()).not.toContain('비공개닉네임');
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: answer('선택한 게임 기록을 같이 볼게. 어떤 분위기로 할까?') });
  });
  await steamFixture(page);
  await expect(page).toHaveURL(/\/chat$/);
  expect(requests).toHaveLength(0);
  await expect(page.getByRole('complementary', { name: '현재 참고 자료' }).getByText('Portal 2', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '재순이에게 메시지' }).fill('이 중에서 골라줘');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toBeVisible();
  expect(requests[0].context.topic).toBe('steam');
  await page.getByRole('button', { name: '첨부 해제' }).click();
  await page.getByRole('textbox', { name: '재순이에게 메시지' }).fill('다른 얘기하자');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toHaveCount(2);
  expect(requests[1].context.topic).toBe('general');
  expect(requests[1].history).toHaveLength(2);
  await expect(page.getByRole('article', { name: '내 메시지' }).first()).toContainText('함께할 Steam 게임');
});

test('실패 재시도는 메시지를 중복하지 않고 새 대화는 늦은 응답을 무시한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_retry', 'E2E AI 재시도'));
  let calls = 0;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/ai', async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 429, json: { error: 'AI 사용 한도에 도달했어요.' } });
    if (calls === 3) await pending;
    await route.fulfill({ json: answer(calls === 3 ? '늦은 답변' : '다시 연결됐어.') }).catch(() => {});
  });
  await page.goto('/chat');
  const input = page.getByRole('textbox', { name: '재순이에게 메시지' });
  await input.fill('안녕');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('region', { name: '재순이와 개인 대화' }).getByRole('alert')).toContainText('한도');
  await page.getByRole('button', { name: '답변 다시 받기' }).click();
  await expect(page.getByRole('article', { name: '내 메시지' })).toHaveCount(1);
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toContainText('다시 연결');
  await input.fill('기다리는 질문');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('status')).toContainText('답장');
  await expect(page.getByRole('button', { name: '메시지 보내기' })).toBeDisabled();
  await page.getByRole('button', { name: '새 대화', exact: true }).click();
  await page.getByRole('button', { name: '지우고 시작' }).click();
  finish();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('늦은 답변')).toHaveCount(0);
});

test('PC·1024px·모바일 대화와 참고 자료·이미지 실패를 표시한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_layout', '게임친구'));
  await page.route('**/api/ai', route => route.fulfill({ json: answer('좋아, 오늘은 가볍게 하는 걸로!\n\n지금 붙여 준 건 게임 후보와 플레이 시간이야. 몇 명이 같이 할 예정이야? 인원에 맞춰 선택 기준을 좁혀보자.') }));
  await mkdir('output/playwright', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await steamFixture(page);
  await page.screenshot({ path: 'output/playwright/chat-idle-1440.png' });
  const input = page.getByRole('textbox', { name: '재순이에게 메시지' });
  await input.fill('오늘 가볍게 할 게임을 골라줘');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByRole('article', { name: '재순이 메시지' })).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expect(input).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/chat-${width}.png` });
    if (width <= 1024) {
      await page.getByRole('button', { name: '참고 자료 1', exact: true }).click();
      await expect(page.getByRole('complementary', { name: '현재 참고 자료' })).toBeVisible();
      await page.screenshot({ path: `output/playwright/chat-materials-${width}.png` });
      await page.getByRole('button', { name: '닫기', exact: true }).click();
      await expect(page.getByRole('complementary', { name: '현재 참고 자료' })).toBeHidden();
    }
  }
  await page.route('**/images/jaesuni-home.webp', route => route.abort());
  await page.reload();
  await expect(page.locator('.chat-intro .chat-avatar')).toHaveText('재');
  await page.screenshot({ path: 'output/playwright/chat-image-failure.png' });
  await input.fill('긴 답변');
  await page.unroute('**/api/ai');
  await page.route('**/api/ai', route => route.fulfill({ json: { ...answer('긴한국어설명'.repeat(300)), truncated: true } }));
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(page.getByText(/응답 길이 제한/)).toBeVisible();
  await expect(input).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('롤 세 화면·홈·기록에서 익명화한 해당 자료로 대화를 연결한다', async ({ page, context }) => {
  const user = await createUser('ai_channels', 'E2E AI 채널');
  await seedDiscovery(user);
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_ai_lol', '비공개소환사', 'KR1')`);
  await loginAs(context, user);
  await mockRiot(page, { gameName: '비공개소환사', tagLine: 'KR1' });
  let topic = '';
  await page.route('**/api/ai', route => {
    expect(route.request().postData()).not.toContain('비공개소환사');
    expect(route.request().postData()).not.toContain('발견 친구');
    expect(route.request().postDataJSON().context.topic).toBe(topic);
    return route.fulfill({ json: answer(`${topic} 자료를 함께 볼게.`) });
  });
  for (const [path, expected] of [['/lol', 'lol'], ['/lol/synergy', 'lol'], ['/lol/mastery', 'lol'], ['/', 'activity'], ['/community', 'activity'], ['/community/awards', 'activity']]) {
    topic = expected;
    await page.goto(path);
    await page.getByRole('button', { name: '자료 붙여서 대화하기' }).first().click();
    await expect(page).toHaveURL(/\/chat$/);
    await page.getByRole('textbox', { name: '재순이에게 메시지' }).fill('이 자료에서 눈에 띄는 점은?');
    await page.getByRole('button', { name: '메시지 보내기' }).click();
    await expect(page.getByRole('article', { name: '재순이 메시지' })).toContainText(`${topic} 자료`);
  }
});


test('멤버 선택·명시적 개인 취향·조회 자료를 대화방에서 관리한다', async ({ page, context, browser }) => {
  const user = await createUser('agent_owner', '조회하는 친구');
  const other = await createUser('agent_other', '다른 친구');
  await db.query(`insert into steam_members(steam_id,persona_name) values ('76561190000000001','선택 친구 1'), ('76561190000000002','선택 친구 2')`);
  await loginAs(context, user);
  await page.setViewportSize({ width: 1440, height: 1000 });
  let calls = 0;
  const evidence = { capturedAt: new Date().toISOString(), context: { topic: 'steam', mode: 'common', scope: 'all', preference: 'balanced', people: 2, excluded: 0, unverified: 0, recentUnavailable: 0,
    games: [{ name: 'Portal 2', owners: 2, totalMinutes: 120 }] } };
  await page.route('**/api/ai', route => {
    calls++;
    const input = route.request().postDataJSON();
    expect(input.selection.steam).toHaveLength(2);
    expect(route.request().postData()).not.toContain('76561190000000001');
    expect(route.request().postData()).not.toContain('선택 친구');
    return route.fulfill({ json: { ...answer('두 명이 공통으로 보유한 게임에 Portal 2가 있어. 최대 인원은 스토어에서 확인해 줘.'), toolsUsed: ['Steam 공통 게임 조회'], evidence } });
  });
  await page.goto('/chat');
  const panel = page.getByRole('complementary', { name: '현재 참고 자료' });
  await panel.getByText('멤버·취향 설정', { exact: true }).click();
  await panel.getByRole('checkbox', { name: '선택 친구 1' }).check();
  await panel.getByRole('checkbox', { name: '선택 친구 2' }).check();
  const preference = panel.getByRole('textbox', { name: '재순이가 기억할 내 취향' });
  await preference.fill('경쟁 게임보다 협동 게임을 좋아해.');
  expect(calls).toBe(0);
  expect((await db.query('select note from ai_preferences where user_id=$1', [user.id])).rowCount).toBe(0);
  await panel.getByRole('button', { name: '취향 저장' }).click();
  await expect(panel.getByRole('status')).toContainText('취향을 저장했어요');
  await page.getByRole('textbox', { name: '재순이에게 메시지' }).fill('선택한 두 명의 공통 게임을 찾아줘');
  await page.getByRole('button', { name: '메시지 보내기' }).click();
  const reply = page.getByRole('article', { name: '재순이 메시지' });
  await expect(reply.getByText('Steam 공통 게임 조회', { exact: true })).toBeVisible();
  await expect(panel.locator('.chat-source-list')).toContainText('Portal 2');
  expect(calls).toBe(1);
  await mkdir('output/playwright', { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    if (width <= 1024) await page.getByRole('button', { name: '참고 자료 1', exact: true }).click();
    await expect(preference).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/agent-settings-${width}.png` });
    if (width <= 1024) await page.getByRole('button', { name: '닫기', exact: true }).click();
  }
  const separate = await browser.newContext();
  try {
    await loginAs(separate, other);
    const otherPage = await separate.newPage();
    await otherPage.goto('/chat');
    await otherPage.getByText('멤버·취향 설정', { exact: true }).click();
    await expect(otherPage.getByRole('textbox', { name: '재순이가 기억할 내 취향' })).toHaveValue('');
  } finally { await separate.close(); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByText('멤버·취향 설정', { exact: true }).click();
  await expect(preference).toHaveValue('경쟁 게임보다 협동 게임을 좋아해.');
  await expect(panel.getByRole('checkbox', { name: '선택 친구 1' })).not.toBeChecked();
  await panel.getByRole('button', { name: '기억 지우기' }).click();
  await expect(panel.getByRole('status')).toContainText('취향을 지웠어요');
  expect((await db.query('select note from ai_preferences where user_id=$1', [user.id])).rowCount).toBe(0);
});

test('Steam 최근 시간과 공개 과제 조회 자료를 PC·태블릿·모바일에서 읽는다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_steam_tools', 'E2E Steam 조회'));
  let calls = 0;
  await page.route('**/api/ai', route => {
    calls++;
    return route.fulfill({ json: { ...answer(calls === 1 ? '최근 2주에 Portal 2를 합계 두 시간 했어.' : '공개 목표는 두 명이 아직 달성하지 않았어.'), toolsUsed: [calls === 1 ? 'Steam 보유·플레이 조회' : 'Steam 공개 도전 과제 조회'], evidence: { capturedAt: new Date().toISOString(), context: {
      topic: 'steam', mode: calls === 1 ? 'recent' : 'missions', scope: 'any', preference: 'balanced', people: 2, excluded: 0, unverified: 0, recentUnavailable: 0,
      games: [{ name: 'Portal 2', totalMinutes: 600, recentMinutes: 120, owners: 2 }],
      ...(calls === 2 ? { missions: { game: 'Portal 2', state: 'ok', unknownAchievements: 0, unavailable: 0, goals: [{ title: '공개 협동 목표', kind: 'team-first', remaining: 2 }] } } : {}),
    } } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/chat');
  const input = page.getByRole('textbox', { name: '재순이에게 메시지' });
  const panel = page.getByRole('complementary', { name: '현재 참고 자료' });
  await input.fill('최근 2주에 한 게임 알려줘');
  await input.press('Enter');
  await expect(panel).toContainText('최근 2주 합계 2시간');
  await expect(panel).not.toContainText('누적 합계 10시간');
  await input.fill('Portal 2 공개 도전 과제 조회해줘');
  await input.press('Enter');
  await expect(panel).toContainText('공개 협동 목표');
  await expect(panel).toContainText('미달성 2명');
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    if (width <= 1024) await page.getByRole('button', { name: '참고 자료 1', exact: true }).click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('협동 달성 여부 미확인');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: `output/playwright/steam-agent-${width}.png` });
    if (width <= 1024) await page.getByRole('button', { name: '닫기', exact: true }).click();
  }
});
