import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guildNow, nowMessage } from './guild';
import { reportFailure } from '../diagnostics';

vi.mock('../diagnostics', () => ({ reportFailure: vi.fn() }));
const guildId = '742002842453409792';
const widget = { channels: [{ id: 'v2', name: '잠수방', position: 2 }, { id: 'v1', name: '게임방', position: 1 }],
  members: [
    { username: '민수', status: 'online', channel_id: 'v1', activity: { name: 'Lethal Company' } },
    { username: '지연', status: 'idle', channel_id: 'v1', game: { name: 'Lethal Company' } },
    { username: '태호', status: 'dnd', activity: { name: 'Valheim' } },
    { username: '*조용*', status: 'online' },
  ], presence_count: 4 };
const fake = (routes: Record<string, () => Response>) => vi.fn<typeof fetch>(async url => {
  const key = Object.keys(routes).find(path => String(url).includes(path));
  if (!key) throw new Error(`unexpected ${url}`);
  return routes[key]();
});
beforeEach(() => vi.resetAllMocks());

describe('/지금', () => {
  it('combines the widget and approximate counts into voice channels and games', async () => {
    const fetchFn = fake({ 'widget.json': () => Response.json(widget), 'with_counts': () => Response.json({ approximate_member_count: 34, approximate_presence_count: 12 }) });
    const now = await guildNow({ guildId, token: 'bot', fetchFn });
    expect(fetchFn.mock.calls.find(call => String(call[0]).includes('widget.json'))![1]).toMatchObject({ headers: {} });
    expect(fetchFn.mock.calls.find(call => String(call[0]).includes('with_counts'))![1]).toMatchObject({ headers: { Authorization: 'Bot bot' } });
    expect(now).toEqual({ online: 12, total: 34, failures: [], widgetDisabled: false,
      voice: [{ name: '게임방', people: ['민수', '지연'] }], games: [{ name: 'Lethal Company', count: 2 }, { name: 'Valheim', count: 1 }] });
    const content = nowMessage(now).content;
    expect(content).toContain('온라인 12명 · 전체 34명');
    expect(content).toContain('게임방 — 2명 (민수, 지연)');
    expect(content).toContain('Lethal Company 2명 · Valheim 1명');
    expect(content).not.toContain('잠수방');
  });
  it('keeps counts when the widget is disabled and says how to turn it on; never fails whole', async () => {
    const now = await guildNow({ guildId, token: 'bot', fetchFn: fake({ 'widget.json': () => Response.json({ code: 50004 }, { status: 403 }), 'with_counts': () => Response.json({ approximate_member_count: 34, approximate_presence_count: 12 }) }) });
    expect(now).toMatchObject({ online: 12, failures: ['widget'], widgetDisabled: true });
    expect(nowMessage(now).content).toContain('서버 설정 → 위젯');
    expect(reportFailure).toHaveBeenCalledWith('api/discord.widget', expect.anything());
    const partial = await guildNow({ guildId, token: 'bot', fetchFn: fake({ 'widget.json': () => Response.json(widget), 'with_counts': () => new Response('secret', { status: 500 }) }) });
    expect(partial).toMatchObject({ online: 4, total: null, failures: ['counts'] });
    expect(nowMessage(partial).content).toContain('서버 인원은 불러오지 못했어요');
  });
  it('distinguishes empty voice/games from failures and escapes names', async () => {
    const empty = await guildNow({ guildId, token: undefined, fetchFn: fake({ 'widget.json': () => Response.json({ channels: [], members: [{ username: '*조용*' }] }) }) });
    const content = nowMessage(empty).content;
    expect(content).toContain('음성 채널에 있는 사람이 없어요'); expect(content).toContain('게임 중인 사람이 없어요');
    expect(empty.failures).toEqual(['counts']);
  });
});
