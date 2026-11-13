import { describe, expect, it } from 'vitest';
import { lobbyMessage, type Lobby } from './lobby';

const base: Lobby = { id: '100000000000000009', ownerId: '100000000000000003', game: '*Game*', playTime: null, max: 2,
  memberIds: ['100000000000000003'], closed: false, version: 1 };
const buttons = (lobby: Lobby) => (lobbyMessage(lobby).components?.[0] as { components: { custom_id: string; disabled: boolean }[] } | undefined)?.components;

describe('lobby message', () => {
  it('escapes user text, shows the count and disables joining only when full', () => {
    expect(lobbyMessage(base).content).toContain('게임: \\*Game\\* · 인원: 1/2명');
    expect(buttons(base)?.find(b => b.custom_id.endsWith(':join'))?.disabled).toBe(false);
    const full = { ...base, memberIds: [...base.memberIds, '100000000000000004'] };
    expect(lobbyMessage(full).content).toContain('(모집 완료)');
    expect(buttons(full)?.find(b => b.custom_id.endsWith(':join'))?.disabled).toBe(true);
    expect(buttons(full)?.find(b => b.custom_id.endsWith(':leave'))?.disabled).toBe(false);
  });
  it('removes every button once closed and never pings', () => {
    const closed = lobbyMessage({ ...base, closed: true });
    expect(closed.content).toContain('(마감)'); expect(closed.components).toEqual([]);
    expect(closed.allowed_mentions).toEqual({ parse: [] });
    expect(lobbyMessage({ ...base, max: null }).content).toContain('인원: 1명');
  });
});
