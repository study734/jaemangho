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

vi.mock('../admin', () => ({ purgeRiotCache: vi.fn() }));
vi.mock('../improvements', () => ({ improvementReport: vi.fn() }));
vi.mock('../operations/audit', () => ({ audited: vi.fn() }));
vi.mock('../operations/jobs', async original => ({ ...await original<typeof import('../operations/jobs')>(), chatConfigured: vi.fn(), runChatSync: vi.fn() }));
vi.mock('../operations/monitor', () => ({ checkOperations: vi.fn() }));
vi.mock('../operations/status', () => ({ operationStatus: vi.fn() }));
vi.mock('../steam/cache', () => ({ purgeSteamCache: vi.fn() }));
const actor = { id: 'u1', name: 'Admin' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(audited).mockImplementation(async (_actor, _action, _target, work) => work());
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
