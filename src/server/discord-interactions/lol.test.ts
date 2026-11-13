import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listRoster } from '../lol/roster';
import { RiotUnavailableError, summonerStats } from '../lol/stats';
import { lolCommand, lolSelection, statsMessage } from './lol';
import { interactionSchema, type ComponentInteraction } from './protocol';

vi.mock('../lol/roster', () => ({ listRoster: vi.fn() }));
vi.mock('../lol/stats', async original => ({ ...await original<typeof import('../lol/stats')>(), summonerStats: vi.fn() }));
const owner = '100000000000000003';
const stats = { gameName: 'A', tagLine: 'KR1', level: 30, flex: null, inGame: true, failures: [] as ('matches' | 'activeGame')[],
  solo: { tier: 'MASTER', rank: 'I', leaguePoints: 120, wins: 3, losses: 1 }, recent: [{ win: false, champion: 'Lux', kills: 1, deaths: 5, assists: 3, mode: 'ARAM' }] };
const pick = (customId: string, value: string, member = owner) => interactionSchema.parse({ id: '100000000000000009', type: 3, application_id: '100000000000000001',
  token: 't', guild_id: '100000000000000002', member: { user: { id: member } }, data: { component_type: 3, custom_id: customId, values: [value] } }) as ComponentInteraction;
beforeEach(() => vi.resetAllMocks());

describe('/전적', () => {
  it('formats rank, recent games and live state, and separates failed parts from empty ones', () => {
    const content = statsMessage(stats).content;
    expect(content).toContain('**A#KR1** · Lv. 30 · 🔴 지금 게임 중');
    expect(content).toContain('솔로랭크: **마스터** 120LP · 3승 1패 (75%)');
    expect(content).toContain('자유랭크: 배치 전');
    expect(content).toContain('❌ 패 Lux 1/5/3 · ARAM');
    const partial = statsMessage({ ...stats, recent: [], failures: ['matches', 'activeGame'], inGame: null }).content;
    expect(partial).toContain('실시간 게임 확인 실패'); expect(partial).toContain('최근 경기를 불러오지 못했어요');
    expect(statsMessage({ ...stats, recent: [] }).content).toContain('최근 경기 기록이 없어요');
  });
  it('looks up a typed Riot ID directly and validates its format', async () => {
    expect((await lolCommand(owner, 'no-tag')).content).toContain('이름#태그');
    vi.mocked(summonerStats).mockResolvedValue(stats);
    await lolCommand(owner, 'Hide on bush # KR1');
    expect(summonerStats).toHaveBeenCalledWith('Hide on bush', 'KR1');
    vi.mocked(summonerStats).mockResolvedValue(null);
    expect((await lolCommand(owner, 'x#y')).content).toContain('존재하지 않는');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(summonerStats).mockRejectedValue(new RiotUnavailableError(403));
    expect((await lolCommand(owner, 'x#y')).content).toContain('API 키');
  });
  it('offers the shared roster (max 25) and only accepts the issuer’s fresh selection', async () => {
    vi.mocked(listRoster).mockResolvedValue([]);
    expect((await lolCommand(owner, undefined)).content).toContain('등록된 소환사가 없어요');
    vi.mocked(listRoster).mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, gameName: `N${i}`, tagLine: 'KR1' })));
    const now = Date.now();
    const menu = (await lolCommand(owner, undefined, now)).components![0] as { components: { custom_id: string; options: unknown[] }[] };
    expect(menu.components[0].options).toHaveLength(25);
    const customId = menu.components[0].custom_id;
    expect((await lolSelection(pick(customId, 'm3', '100000000000000004'))).content).toContain('만료');
    expect((await lolSelection(pick(customId, 'm3'), now + 901_000)).content).toContain('만료');
    expect((await lolSelection(pick(customId, 'gone'))).content).toContain('삭제된');
    vi.mocked(summonerStats).mockResolvedValue(stats);
    await lolSelection(pick(customId, 'm3'));
    expect(summonerStats).toHaveBeenCalledWith('N3', 'KR1');
  });
});

describe('/전적 roster order', () => {
  it('puts the requester’s own accounts first and marks them', async () => {
    vi.mocked(listRoster).mockResolvedValue([{ id: 'm1', gameName: 'Other', tagLine: 'KR1', ownerId: 'u2' }, { id: 'm2', gameName: 'Mine', tagLine: 'KR1', ownerId: 'u1' }]);
    const menu = (await lolCommand(owner, undefined, Date.now(), 'u1')).components![0] as { components: { options: { value: string; description?: string }[] }[] };
    expect(menu.components[0].options).toEqual([{ label: 'Mine#KR1', value: 'm2', description: '내 계정' }, { label: 'Other#KR1', value: 'm1' }]);
  });
});
