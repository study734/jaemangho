import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openTestDb, testDbUrl } from '../testing/db';

describe.skipIf(!testDbUrl)('소환사 목록 (DB)', () => {
  let pool: Awaited<ReturnType<typeof openTestDb>>;
  let roster: typeof import('./roster');
  const creator = { id: 'creator_1', name: '등록자' };
  const entry = (id: string, gameName: string, tagLine = 'KR1') => ({ id, gameName, tagLine });

  beforeAll(async () => {
    pool = await openTestDb();
    roster = await import('./roster');
    await pool.query(`delete from members where id like 't_%'`);
  });
  afterAll(async () => {
    await pool.query(`delete from members where id like 't_%'`);
    await pool.end();
  });

  it('추가하면 목록에 나오고 등록자가 기록된다', async () => {
    await roster.addToRoster(entry('t_1', 'Faker'), creator);
    expect(await roster.listRoster()).toContainEqual(entry('t_1', 'Faker'));
    const { rows } = await pool.query(`select created_by, created_by_name from members where id = 't_1'`);
    expect(rows[0]).toEqual({ created_by: 'creator_1', created_by_name: '등록자' });
  });

  it('같은 Riot ID는 대소문자가 달라도 중복으로 거부한다', async () => {
    await expect(roster.addToRoster(entry('t_2', 'faker', 'kr1'), creator)).rejects.toBeInstanceOf(roster.DuplicateSummonerError);
  });

  it('수정할 수 있고, 이미 있는 Riot ID로 바꾸면 중복으로 거부한다', async () => {
    await roster.addToRoster(entry('t_3', 'Other'), creator);
    await roster.updateRoster(entry('t_3', 'Renamed', 'KR2'));
    expect(await roster.listRoster()).toContainEqual(entry('t_3', 'Renamed', 'KR2'));
    await expect(roster.updateRoster(entry('t_3', 'Faker'))).rejects.toBeInstanceOf(roster.DuplicateSummonerError);
  });

  it('삭제하면 목록에서 사라지고, 없는 id를 지워도 오류가 아니다', async () => {
    await roster.removeFromRoster('t_1');
    expect((await roster.listRoster()).some((e) => e.id === 't_1')).toBe(false);
    await expect(roster.removeFromRoster('t_nope')).resolves.toBeUndefined();
  });
});

describe('소환사 입력 검증 (DB 불필요)', () => {
  it('올바른 입력은 공백을 다듬어 통과한다', async () => {
    const { rosterEntrySchema } = await import('./roster');
    expect(rosterEntrySchema.parse({ id: 'abc_1', gameName: '  Faker ', tagLine: ' KR1 ' })).toEqual({ id: 'abc_1', gameName: 'Faker', tagLine: 'KR1' });
  });
  it.each([
    ['id에 허용되지 않는 문자', { id: 'a b', gameName: 'x', tagLine: 'y' }],
    ['빈 소환사명', { id: 'a', gameName: '   ', tagLine: 'y' }],
    ['너무 긴 소환사명', { id: 'a', gameName: 'x'.repeat(33), tagLine: 'y' }],
    ['너무 긴 태그', { id: 'a', gameName: 'x', tagLine: 'y'.repeat(17) }],
    ['타입이 다른 값', { id: 1, gameName: 'x', tagLine: 'y' }],
    ['필드 누락', { id: 'a' }],
  ])('거부: %s', async (_name, input) => {
    const { rosterEntrySchema } = await import('./roster');
    expect(rosterEntrySchema.safeParse(input).success).toBe(false);
  });
});
