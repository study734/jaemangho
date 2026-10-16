import { beforeEach, describe, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ steam: vi.fn(), roster: vi.fn(), compare: vi.fn(), proxy: vi.fn(), sql: vi.fn(), consent: vi.fn() }));
vi.mock('../steam/roster', () => ({ listSteamMembers: fakes.steam }));
vi.mock('../steam/games', () => ({ compareGames: fakes.compare }));
vi.mock('../lol/roster', () => ({ listRoster: fakes.roster }));
vi.mock('../riot/proxy', () => ({ proxyRiot: fakes.proxy }));
vi.mock('../db', () => ({ db: async () => fakes.sql }));
vi.mock('../steam/consent', () => ({ hasSteamConsent: fakes.consent }));
vi.mock('./steam-tools', () => ({ steamArguments: {}, steamRead: vi.fn() }));
import { memberChoices, parseTool, readTool } from './tools';
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks(); fakes.consent.mockResolvedValue(true);
  fakes.steam.mockResolvedValue([{ steamId: '76561190000000001', name: 'private-name' }]);
  fakes.roster.mockResolvedValue([{ id: 'private-id', gameName: 'private-name', tagLine: 'private-tag' }]);
  fakes.compare.mockResolvedValue({ games: [{ name: 'Portal 2', totalMinutes: 60, owners: 1, appId: 620 }], excluded: [] });
});
describe('read-only agent tools', () => {
  it('maps local opaque selection back to registered members and strips names and IDs', async () => {
    const choices = await memberChoices();
    expect(choices.steam[0].label).toBe('private-name');
    const result = await readTool('get_common_games', { steam: [choices.steam[0].ref], lol: null }, signal());
    expect(fakes.compare).toHaveBeenCalledWith(['76561190000000001'], 'common');
    expect(result.context).toMatchObject({ topic: 'steam', people: 1, games: [{ name: 'Portal 2' }] });
    expect(JSON.stringify(result)).not.toMatch(/private-|7656119|appId/);
  });
  it('requires a valid selection and does not present partial libraries as all-owned', async () => {
    await expect(readTool('get_common_games', { steam: ['s_' + '0'.repeat(24)], lol: null }, signal())).resolves.toMatchObject({ status: 'selection_required' });
    expect(fakes.compare).not.toHaveBeenCalled();
    const choices = await memberChoices();
    fakes.compare.mockResolvedValueOnce({ games: [{ name: 'Portal 2', totalMinutes: 1 }], excluded: ['private-id'] });
    await expect(readTool('get_common_games', { steam: [choices.steam[0].ref], lol: null }, signal())).resolves.toMatchObject({ context: { games: [], excluded: 1 } });
  });
  it('queries only existing Riot proxy routes and returns anonymous rank data', async () => {
    fakes.roster.mockResolvedValueOnce([{ id: 'private-id', gameName: '비공개 소환사', tagLine: 'KR1' }]);
    const choices = await memberChoices();
    fakes.roster.mockResolvedValueOnce([{ id: 'private-id', gameName: '비공개 소환사', tagLine: 'KR1' }]);
    fakes.proxy.mockImplementation(async request => ({ status: 200, body: request.path.startsWith('/riot/account') ? { puuid: 'private-puuid' }
      : request.path.includes('/league/') ? [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', wins: 2, losses: 1 }] : [] }));
    const result = await readTool('get_lol_records', { steam: [], lol: choices.lol[0].ref }, signal());
    expect(result.context).toMatchObject({ topic: 'lol', players: [{ player: 1, tier: 'GOLD', matches: [], detailsUnavailable: false }] });
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(fakes.proxy).toHaveBeenCalledTimes(3);
    expect(fakes.proxy.mock.calls[0][0].path).toContain('비공개 소환사/KR1');
    expect(fakes.proxy.mock.calls.every(([request]) => !!request.route)).toBe(true);
  });
  it('refuses arbitrary tool arguments and stops before reads on abort', async () => {
    expect(() => parseTool('get_common_games', '{"url":"https://example.com"}')).toThrow();
    expect(() => parseTool('constructor', '{}')).toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(readTool('get_activity_summary', { steam: [], lol: null }, controller.signal)).rejects.toThrow();
    expect(fakes.sql).not.toHaveBeenCalled();
  });
  it('requires Steam feature consent for Steam tools and removes personal recommendation tools', async () => {
    expect(() => parseTool('get_personal_games', '{}')).toThrow('unsupported_tool');
    fakes.consent.mockResolvedValue(false);
    const result = await readTool('get_common_games', { steam: [], lol: null }, signal(), 'actor');
    expect(result.status).toBe('selection_required');
    expect(fakes.compare).not.toHaveBeenCalled();
    expect(fakes.steam).not.toHaveBeenCalled();
  });
});
