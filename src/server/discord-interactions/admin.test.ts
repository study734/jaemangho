import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeRiotCache } from '../admin';
import { improvementReport } from '../improvements';
import { audited } from '../operations/audit';
import { chatConfigured, runChatSync, SyncBusyError } from '../operations/jobs';
import { checkOperations } from '../operations/monitor';
import { operationStatus } from '../operations/status';
import { purgeSteamCache } from '../steam/cache';
import { hasAdministrator } from './access';
import { adminTask } from './admin';
import { postWeeklyAwards, setAwardChannel } from '../chat/award-post';
import { recentFeedback } from './feedback';

vi.mock('../admin', () => ({ purgeRiotCache: vi.fn() }));
vi.mock('../improvements', () => ({ improvementReport: vi.fn() }));
vi.mock('../operations/audit', () => ({ audited: vi.fn() }));
vi.mock('../operations/jobs', async original => ({ ...await original<typeof import('../operations/jobs')>(), chatConfigured: vi.fn(), runChatSync: vi.fn() }));
vi.mock('../operations/monitor', () => ({ checkOperations: vi.fn() }));
vi.mock('../operations/status', () => ({ operationStatus: vi.fn() }));
vi.mock('../steam/cache', () => ({ purgeSteamCache: vi.fn() }));
vi.mock('../chat/award-post', () => ({ postWeeklyAwards: vi.fn(), setAwardChannel: vi.fn() }));
vi.mock('./feedback', () => ({ recentFeedback: vi.fn() }));
const actor = { id: 'u1', name: 'Admin' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(audited).mockImplementation(async (_actor, _action, _target, work) => work());
  vi.mocked(recentFeedback).mockResolvedValue({ count: 0, items: [] });
});

describe('Administrator permission bit', () => {
  it('requires bit 8 in the signed permissions string', () => {
    expect(hasAdministrator('8')).toBe(true);
    expect(hasAdministrator(String((1n << 40n) | 8n))).toBe(true);
    for (const value of [undefined, '', '0', '7', '16', String(1n << 40n), 'x8']) expect(hasAdministrator(value)).toBe(false);
  });
});

describe('admin tasks', () => {
  it('records every state-changing task in the audit log with the verified actor', async () => {
    vi.mocked(purgeSteamCache).mockResolvedValue({ deleted: 12 });
    vi.mocked(purgeRiotCache).mockResolvedValue(3);
    vi.mocked(checkOperations).mockResolvedValue({ skipped: false, active: 2 });
    expect((await adminTask('steam', actor)).content).toContain('Steam 캐시 12개');
    expect((await adminTask('riot', actor)).content).toContain('Riot 캐시 3개');
    expect((await adminTask('점검', actor)).content).toContain('활성 경고 2개');
    expect(vi.mocked(audited).mock.calls.map(call => [call[0], call[1], call[2]])).toEqual([
      [actor, 'cache.steam.purge', 'steam'], [actor, 'cache.riot.purge', 'riot'], [actor, 'monitor.check', 'operations']]);
  });
  it('runs chat sync inside the Discord budget and distinguishes unconfigured and busy states', async () => {
    vi.mocked(chatConfigured).mockReturnValue(false);
    expect((await adminTask('동기화', actor)).content).toContain('설정');
    expect(runChatSync).not.toHaveBeenCalled();
    vi.mocked(chatConfigured).mockReturnValue(true);
    vi.mocked(runChatSync).mockResolvedValue({ id: '00000000-0000-0000-0000-000000000000', status: 'partial', channels: 2, messages: 1500, rateLimited: true });
    expect((await adminTask('동기화', actor)).content).toContain('부분 완료');
    expect(vi.mocked(runChatSync).mock.calls[0][1]).toMatchObject({ budgetMs: 30_000 });
    vi.mocked(runChatSync).mockRejectedValue(new SyncBusyError());
    expect((await adminTask('동기화', actor)).content).toContain('이미 실행 중');
  });
  it('summarizes improvements and status without the web dashboard', async () => {
    vi.mocked(improvementReport).mockResolvedValue({ usageEnough: false, totalViews: { current: 4, previous: 2 },
      items: [{ id: 'fix:lol', kind: 'fix', target: '롤', reasons: ['Riot 키 오류(401/403) 3회'], next: 'Riot API 키 만료·형식 확인', views: 1 }] });
    const improvements = (await adminTask('개선', actor)).content;
    expect(improvements).toContain('**[고치기] 롤** — Riot 키 오류(401/403) 3회');
    expect(improvements).toContain('사용량 판단');
    vi.mocked(operationStatus).mockResolvedValue({ jobs: [], lastSuccess: null, checkedAt: null, audit: [], chatConfigured: true, notificationsConfigured: false,
      alerts: [{ key: 'riot.key', title: 'Riot 키 오류', severity: 'critical', active: true, firstSeen: '', resolvedAt: null, notificationError: null }],
      steam: { cache: { rows: 10, fresh: 7 }, stats: [], errors: [] } });
    const status = (await adminTask('상태', actor)).content;
    expect(status).toContain('활성 경고 1개'); expect(status).toContain('🔴 Riot 키 오류'); expect(status).toContain('7/10');
  });
});

describe('weekly award posting (admin)', () => {
  it('sets and clears the channel through the audit log', async () => {
    expect((await adminTask('시상식채널', actor, '100000000000000777')).content).toContain('<#100000000000000777>');
    expect((await adminTask('시상식채널', actor)).content).toContain('껐어요');
    expect(vi.mocked(setAwardChannel).mock.calls).toEqual([['100000000000000777', 'u1'], [null, 'u1']]);
    expect(vi.mocked(audited).mock.calls.map(call => call[1])).toEqual(['awards.channel.set', 'awards.channel.clear']);
  });
  it('posts now and explains each outcome, including missing bot permission', async () => {
    for (const [result, text] of [
      [{ status: 'posted', week: '2026-11-02', channelId: '100000000000000777' }, '올렸어요'],
      [{ status: 'already_posted' }, '이미 올렸어요'], [{ status: 'disabled' }, '먼저 정해'], [{ status: 'no_awards' }, '눈팅러만'],
      [{ status: 'failed', week: '2026-11-02', channelId: '100000000000000777', code: 'discord_http_403' }, '메시지 보내기 권한'],
    ] as const) {
      vi.mocked(postWeeklyAwards).mockResolvedValue(result);
      expect((await adminTask('시상식게시', actor)).content).toContain(text);
    }
    expect(vi.mocked(audited).mock.calls.every(call => call[1] === 'awards.post')).toBe(true);
  });
});

describe('/개선의 멤버 의견 (intent/0002 R6)', () => {
  it('최근 7일 의견 수와 최신 의견을 이름·날짜·앞 200자·링크로, 멘션 없이 보여준다', async () => {
    vi.mocked(improvementReport).mockResolvedValue({ usageEnough: true, totalViews: { current: 0, previous: 0 }, items: [] });
    const link = 'https://discord.com/channels/1/2/3';
    vi.mocked(recentFeedback).mockResolvedValue({ count: 2, items: [
      { name: '**굵게**', body: `${'가'.repeat(250)}`, messageLink: link, createdAt: '2026-11-20T03:00:00Z' },
      { name: '둘', body: '<@100000000000000003> 줄\n바꿈', messageLink: null, createdAt: '2026-11-19T03:00:00Z' },
    ] });
    const text = (await adminTask('개선', actor)).content;
    expect(text).toContain('💬 멤버 의견 (최근 7일 2건)');
    expect(text).toContain('\\*\\*굵게\\*\\*');
    expect(text).toContain(`${'가'.repeat(200)}…`);
    expect(text).not.toContain('가'.repeat(201));
    expect(text).toContain(`[메시지](<${link}>)`);
    expect(text).not.toContain('<@100000000000000003>');
  });
  it('의견이 없으면 의견 절을 붙이지 않는다', async () => {
    vi.mocked(improvementReport).mockResolvedValue({ usageEnough: true, totalViews: { current: 0, previous: 0 }, items: [] });
    expect((await adminTask('개선', actor)).content).not.toContain('멤버 의견');
  });
});
