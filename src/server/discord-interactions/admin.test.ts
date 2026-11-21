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
import { usageReport } from './usage';
import { setMemberRole } from '../member-role';

vi.mock('../admin', () => ({ purgeRiotCache: vi.fn() }));
vi.mock('../improvements', () => ({ improvementReport: vi.fn() }));
vi.mock('../operations/audit', () => ({ audited: vi.fn() }));
vi.mock('../operations/jobs', async original => ({ ...await original<typeof import('../operations/jobs')>(), chatConfigured: vi.fn(), runChatSync: vi.fn() }));
vi.mock('../operations/monitor', () => ({ checkOperations: vi.fn() }));
vi.mock('../operations/status', () => ({ operationStatus: vi.fn() }));
vi.mock('../steam/cache', () => ({ purgeSteamCache: vi.fn() }));
vi.mock('../chat/award-post', () => ({ postWeeklyAwards: vi.fn(), setAwardChannel: vi.fn() }));
vi.mock('./feedback', () => ({ recentFeedback: vi.fn() }));
vi.mock('./usage', () => ({ usageReport: vi.fn() }));
vi.mock('../member-role', () => ({ setMemberRole: vi.fn() }));
const actor = { id: 'u1', name: 'Admin' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(audited).mockImplementation(async (_actor, _action, _target, work) => work());
  vi.mocked(recentFeedback).mockResolvedValue({ count: 0, items: [] });
  vi.mocked(usageReport).mockResolvedValue([]);
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

describe('/운영 사용역할 (intent/0004 R9)', () => {
  it('작업 이력을 남기며 역할을 정하고 끄고, 웹은 다음 로그인부터라는 것과 봇 토큰이 없을 때를 알린다', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', 'bot');
    const set = (await adminTask('사용역할', actor, '100000000000000500')).content;
    expect(set).toContain('<@&100000000000000500>'); expect(set).toContain('다음 로그인부터'); expect(set).not.toContain('봇 토큰');
    expect((await adminTask('사용역할', actor)).content).toContain('껐어요');
    vi.stubEnv('DISCORD_BOT_TOKEN', '');
    expect((await adminTask('사용역할', actor, '100000000000000500')).content).toContain('봇 토큰');
    vi.unstubAllEnvs();
    expect(vi.mocked(setMemberRole).mock.calls).toEqual([['100000000000000500', 'u1'], [null, 'u1'], ['100000000000000500', 'u1']]);
    expect(vi.mocked(audited).mock.calls.map(call => call[1])).toEqual(['access.role.set', 'access.role.clear', 'access.role.set']);
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
    vi.mocked(recentFeedback).mockResolvedValue({ count: 3, items: [
      { name: '**굵게**', discordId: '100000000000000005', body: `${'가'.repeat(250)}`, messageLink: link, createdAt: '2026-11-20T03:00:00Z' },
      { name: '둘', discordId: '100000000000000006', body: '<@100000000000000003> 줄\n바꿈', messageLink: null, createdAt: '2026-11-19T03:00:00Z' },
      { name: null, discordId: '100000000000000007', body: '손님 의견', messageLink: null, createdAt: '2026-11-18T03:00:00Z' },
    ] });
    const text = (await adminTask('개선', actor)).content;
    expect(text).toContain('💬 멤버 의견 (최근 7일 3건)');
    expect(text).toContain('\\*\\*굵게\\*\\*');
    expect(text).toContain(`${'가'.repeat(200)}…`);
    expect(text).not.toContain('가'.repeat(201));
    expect(text).toContain(`[메시지](<${link}>)`);
    expect(text).not.toContain('<@100000000000000003>');
    // 사이트 계정 없이 보낸 의견(intent/0004 R4)은 멘션으로 보이고, 메시지는 알림을 보내지 않는다.
    expect(text).toContain('- <@100000000000000007> · ');
    expect((await adminTask('개선', actor)).allowed_mentions).toEqual({ parse: [] });
  });
  it('의견이 없으면 의견 절을 붙이지 않는다', async () => {
    vi.mocked(improvementReport).mockResolvedValue({ usageEnough: true, totalViews: { current: 0, previous: 0 }, items: [] });
    expect((await adminTask('개선', actor)).content).not.toContain('멤버 의견');
  });
});

describe('/개선의 디스코드 사용 (intent/0003 R6)', () => {
  it('최근 7일 횟수·전주 대비·하루 최대 사용자·평균 시간을 보여주고, 사용이 없으면 생략한다', async () => {
    vi.mocked(improvementReport).mockResolvedValue({ usageEnough: true, totalViews: { current: 0, previous: 0 }, items: [] });
    expect((await adminTask('개선', actor)).content).not.toContain('디스코드 사용');
    vi.mocked(usageReport).mockResolvedValue([
      { action: '/게임추천', uses: 12, previous: 4, maxUsers: 5, avgMs: 2100 },
      { action: '/의견', uses: 1, previous: 0, maxUsers: 1, avgMs: 30 },
    ]);
    const text = (await adminTask('개선', actor)).content;
    expect(text).toContain('🎮 디스코드 사용 (최근 7일, 그 전 7일 대비)');
    expect(text).toContain('/게임추천 12회 (+200%) · 하루 최대 5명 · 평균 2.1초');
    expect(text).toContain('/의견 1회 (새로) · 하루 최대 1명 · 평균 0.0초');
  });
});

describe('/개선의 부분 실패 (AGENTS: 부분 실패와 전체 실패 구분)', () => {
  it('의견·사용량 조회가 실패해도 개선 우선순위는 보여주고, 실패한 절만 알린다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(improvementReport).mockResolvedValue({ usageEnough: true, totalViews: { current: 4, previous: 2 },
      items: [{ id: 'fix:lol', kind: 'fix', target: '롤', reasons: ['Riot 키 오류 3회'], next: '', views: 1 }] });
    vi.mocked(recentFeedback).mockRejectedValue(new Error('feedback down'));
    vi.mocked(usageReport).mockRejectedValue(new Error('usage down'));
    const text = (await adminTask('개선', actor)).content;
    expect(text).toContain('**[고치기] 롤**');
    expect(text).toContain('디스코드 사용을 불러오지 못했어요');
    expect(text).toContain('멤버 의견을 불러오지 못했어요');
  });
});
