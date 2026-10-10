import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDb, openTestDb, testDbUrl } from './testing/db';
import type { Pool } from 'pg';

describe.skipIf(!testDbUrl)('발견 맥락과 멤버 반응', () => {
  let pool: Pool;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    const scratch = await createScratchDb();
    drop = scratch.drop;
    pool = await openTestDb(scratch.url);
    await pool.query(`insert into "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      values ('discovery_friend', '선장', 'discovery@test.invalid', false, '/avatar.webp', now(), now()),
      ('discovery_other', '친구', 'other@test.invalid', false, null, now(), now())`);
    await pool.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values ('discovery_account', 'author_0', 'discord', 'discovery_friend', now(), now())`);
  });
  afterAll(async () => { await pool?.end(); await drop?.(); });

  it('같은 채널의 과거 활성 구간 중앙값과 실제 참여자·아바타를 연결한다', async () => {
    await pool.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at)
      select 'baseline_' || b || '_' || n, 'channel', 'author_' || (n % 4),
        case when n % 4 = 0 then '선장' else '친구' || (n % 4) end,
        timestamptz '2026-10-09 09:00:00Z' - b * interval '1 day' + n * interval '1 second'
      from generate_series(1, 6) b cross join generate_series(0, 11) n`);
    await pool.query(`insert into chat_messages (id, channel_id, author_id, author_name, created_at)
      select 'current_' || n, 'channel', 'author_' || (n % 4),
        case when n % 4 = 0 then '선장' else '친구' || (n % 4) end,
        timestamptz '2026-10-09 09:00:00Z' + n * interval '1 second'
      from generate_series(0, 39) n`);
    const { contextualizeMoments } = await import('./discovery-context');
    const [moment] = await contextualizeMoments([{ url: 'https://discord.com/channels/G/channel/current_0', at: '2026-10-09T09:00:00Z', messages: 40, people: 4 }]);
    expect(moment.baseline).toBe(12);
    expect(moment.baselineSamples).toBe(6);
    expect(moment.participants).toHaveLength(4);
    expect(moment.participants.find(p => p.name === '선장')).toEqual({ name: '선장', userId: 'discovery_friend', image: '/avatar.webp' });
  });

  it('비교할 기록이 없는 구간은 평소보다 활발했다고 꾸미지 않는다', async () => {
    const { contextualizeMoments } = await import('./discovery-context');
    const [moment] = await contextualizeMoments([{ url: 'https://discord.com/channels/G/unknown/1', at: '2026-10-09T09:00:00Z', messages: 40, people: 4 }]);
    expect(moment.baseline).toBeNull();
    expect(moment.baselineSamples).toBe(0);
    expect(moment.participants).toEqual([]);
  });

  it('멤버별 반응을 한 번만 저장하고 재접속·취소·다른 멤버를 구분한다', async () => {
    const { discoveryReaction, setDiscoveryReaction } = await import('./discovery-reactions');
    expect(await setDiscoveryReaction('play:steam', 'discovery_friend', true)).toEqual({ count: 1, reacted: true });
    expect(await setDiscoveryReaction('play:steam', 'discovery_friend', true)).toEqual({ count: 1, reacted: true });
    expect(await discoveryReaction('play:steam', 'discovery_other')).toEqual({ count: 1, reacted: false });
    expect(await setDiscoveryReaction('play:steam', 'discovery_other', true)).toEqual({ count: 2, reacted: true });
    expect(await setDiscoveryReaction('play:steam', 'discovery_friend', false)).toEqual({ count: 1, reacted: false });
    expect(await discoveryReaction('play:steam', 'discovery_other')).toEqual({ count: 1, reacted: true });
  });

  it('존재하지 않는 원문에는 반응을 저장하지 않는다', async () => {
    const { setDiscoveryReaction, DiscoveryRecordMissingError } = await import('./discovery-reactions');
    await expect(setDiscoveryReaction('highlight:https://discord.com/channels/G/channel/missing', 'discovery_friend', true)).rejects.toBeInstanceOf(DiscoveryRecordMissingError);
  });
});
