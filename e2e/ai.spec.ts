import { mkdir } from 'node:fs/promises';
import { cleanup, createUser, db, expect, loginAs, mockRiot, seedDiscovery, statusOf, test } from './fixtures';

test.beforeEach(cleanup);
test.afterAll(cleanup);

test('AI API는 로그인 보호와 미설정 안내를 유지한다', async ({ page, context }) => {
  await page.goto('/login');
  expect(await statusOf(page, '/api/ai', { method: 'POST', body: { context: { topic: 'general' } } })).toBe(401);
  await loginAs(context, await createUser('ai_config', 'E2E AI 설정'));
  expect(await statusOf(page, '/api/ai', { method: 'POST', body: { context: { topic: 'general' } } })).toBe(503);
});

test('AI 해설은 클릭할 때만 요청하고 실패 후 재시도와 질문을 지원한다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_flow', 'E2E AI 흐름'));
  await mockRiot(page);
  let calls = 0;
  await page.route('**/api/ai', route => {
    calls++;
    expect(route.request().postDataJSON().context.topic).toBe('activity');
    return route.fulfill(calls === 1 ? { status: 429, json: { error: 'AI 사용 한도에 도달했어요.' } }
      : { json: { answer: '반응과 답글 집계에 근거한 AI 해설입니다.', model: 'fixture', truncated: false } });
  });
  await page.goto('/community');
  const panel = page.getByRole('region', { name: '재순이 AI 해설' });
  await expect(panel).toBeVisible();
  expect(calls).toBe(0);
  await panel.getByRole('button', { name: '재순이 AI 해설 보기' }).click();
  await expect(panel.getByRole('alert')).toContainText('한도');
  await panel.getByRole('button', { name: '재순이 AI 해설 보기' }).click();
  await expect(panel.getByRole('status')).toContainText('집계에 근거한');
  await panel.getByText('재순이에게 질문하기', { exact: true }).click();
  await panel.getByLabel('현재 자료에 관해 질문').fill('이 집계에서 알 수 있는 것은?');
  await panel.getByRole('button', { name: '재순이에게 질문 보내기' }).click();
  await expect(panel.getByRole('status')).toContainText('집계에 근거한');
  expect(calls).toBe(3);
});

test('Steam 조건이 바뀌면 이전 AI 결과를 지우고 전송 자료에 멤버 ID를 넣지 않는다', async ({ page, context }) => {
  await loginAs(context, await createUser('ai_steam', 'E2E AI Steam'));
  await page.route('**/api/steam/members', route => route.fulfill({ json: [{ steamId: '76561190000000001', name: '비공개닉네임', avatar: null }] }));
  await page.route('**/api/steam/games**', route => route.fulfill({ json: { games: [{ appId: 620, name: 'Portal 2', totalMinutes: 60 }], excluded: [] } }));
  await page.route('**/api/ai', route => {
    expect(route.request().postData()).not.toContain('76561190000000001');
    expect(route.request().postData()).not.toContain('비공개닉네임');
    return route.fulfill({ json: { answer: '게임 비교 설명', model: 'fixture', truncated: false } });
  });
  await page.goto('/steam');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '비교하기 (1명)' }).click();
  await page.getByRole('button', { name: '재순이 AI 해설 보기' }).click();
  await expect(page.getByText('게임 비교 설명')).toBeVisible();
  await page.getByRole('checkbox').uncheck();
  await expect(page.getByText('게임 비교 설명')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '재순이 AI 해설' })).toHaveCount(0);
});

test('AI 해설은 PC·1024px·모바일에서 긴 답변과 이미지 실패를 표시한다', async ({ page, context }) => {
  const user = await createUser('ai_layout', 'E2E AI 화면');
  await seedDiscovery(user);
  await loginAs(context, user);
  await page.route('**/api/ai', route => route.fulfill({ json: {
    answer: '확인된 반응과 답글 수로 활동을 설명해요. 대화 내용이나 참여자의 감정은 알 수 없어요.\n' + '긴한국어설명'.repeat(30),
    model: 'fixture', truncated: true,
  } }));
  await mkdir('output/playwright', { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390) await page.route('**/images/jaesuni-home.webp', route => route.abort());
    await page.goto('/community');
    const panel = page.getByRole('region', { name: '재순이 AI 해설' });
    await panel.getByRole('button', { name: '재순이 AI 해설 보기' }).click();
    await expect(panel.getByRole('status')).toContainText('길이 제한');
    await panel.getByText('재순이에게 질문하기', { exact: true }).click();
    await panel.getByLabel('현재 자료에 관해 질문').fill('집계의 한계를 설명해 줘');
    await expect(panel.getByRole('button', { name: '재순이에게 질문 보내기' })).toBeEnabled();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/ai-${width}.png` });
  }
});

test('질문 예시는 호출 없이 입력을 채우고 안내·로딩·답변의 위계를 유지한다', async ({ page, context }) => {
  const user = await createUser('ai_prompts', 'E2E AI 질문 예시');
  await seedDiscovery(user);
  await loginAs(context, user);
  let calls = 0;
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/ai', async route => {
    calls++;
    expect(route.request().postDataJSON().question).toBe('이 집계로 알 수 있는 것과 알 수 없는 것을 구분해 줘.');
    await ready;
    await route.fulfill({ json: { answer: '확인된 기록에서만 이야기할게.\n\n표시된 구간에는 4명이 10분 동안 메시지 40개를 남겼어. 함께 대화한 양을 보여 주는 기록이야.\n\n무슨 이야기를 했는지, 왜 모였는지는 이 숫자만으로 알 수 없어. 원래 기록과 함께 살펴보면 좋아.', model: 'fixture', truncated: false } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/community');
  const panel = page.getByRole('region', { name: '재순이 AI 해설' });
  await expect(panel.getByRole('heading', { name: '함께한 기록, 한눈에' })).toBeVisible();
  await panel.getByRole('button', { name: '이 기록의 한계는?' }).click();
  const input = panel.getByLabel('현재 자료에 관해 질문');
  await expect(input).toHaveValue('이 집계로 알 수 있는 것과 알 수 없는 것을 구분해 줘.');
  await expect(input).toBeFocused();
  expect(calls).toBe(0);
  await panel.getByText('NVIDIA AI 사용 · 전송 안내', { exact: true }).click();
  await expect(panel.getByText(/성공한 답변은 서버 메모리에서 5분간 재사용해요/)).toBeVisible();
  await panel.getByText('NVIDIA AI 사용 · 전송 안내', { exact: true }).click();
  await mkdir('output/playwright', { recursive: true });
  await panel.screenshot({ path: 'output/playwright/ai-new-idle.png' });
  await panel.getByRole('button', { name: '재순이에게 질문 보내기' }).click();
  await expect(panel.getByRole('status')).toContainText('기록을 읽고 있어');
  await expect(input).toBeDisabled();
  await panel.screenshot({ path: 'output/playwright/ai-new-loading.png' });
  finish();
  await expect(panel.getByRole('status')).toContainText('확인된 기록에서만');
  await expect(panel.locator('.ai-answer-copy > p')).toHaveCount(3);
  expect(calls).toBe(1);
  await panel.getByText('재순이에게 질문하기', { exact: true }).click();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({ path: `output/playwright/ai-new-answer-${width}.png` });
  }
});

test('롤 세 화면·시상식·홈에서 해당 자료로 해설하고 이름은 전송하지 않는다', async ({ page, context }) => {
  const user = await createUser('ai_channels', 'E2E AI 채널');
  await seedDiscovery(user);
  await db.query(`insert into members (id, game_name, tag_line) values ('e2e_ai_lol', '비공개소환사', 'KR1')`);
  await loginAs(context, user);
  await mockRiot(page, { gameName: '비공개소환사', tagLine: 'KR1' });
  await page.route('**/api/ai', route => {
    expect(route.request().postData()).not.toContain('비공개소환사');
    expect(route.request().postData()).not.toContain('발견 친구');
    const topic = route.request().postDataJSON().context.topic;
    return route.fulfill({ json: { answer: `${topic} 자료에 대한 AI 해설`, model: 'fixture', truncated: false } });
  });
  await mkdir('output/playwright', { recursive: true });
  for (const [path, topic, file] of [['/lol', 'lol', 'lol'], ['/lol/synergy', 'lol', 'synergy'],
    ['/lol/mastery', 'lol', 'mastery'], ['/community/awards', 'activity', 'awards'], ['/', 'activity', 'home']]) {
    await page.goto(path);
    const panel = page.getByRole('region', { name: '재순이 AI 해설' }).first();
    await panel.getByRole('button', { name: '재순이 AI 해설 보기' }).click();
    await expect(panel.getByRole('status')).toContainText(`${topic} 자료에 대한 AI 해설`);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/ai-${file}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const discovery = await page.getByRole('region', { name: '오늘은 무슨 일이 있었을까?' }).boundingBox();
  const general = await page.locator('.home-ai-message').boundingBox();
  expect(general!.y).toBeGreaterThanOrEqual(discovery!.y + discovery!.height);
  await page.locator('.home-ai-message').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/ai-home-mobile.png' });
});
