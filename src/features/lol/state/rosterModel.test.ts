import { expect, it, vi } from 'vitest';
import { createRosterModel } from './rosterModel';
import { RosterRequestError, toMember } from '../api/roster';
import type { LolData, Details } from '../api/lolData';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const entry = { id: 'A', gameName: 'friend', tagLine: 'KR1' };
const base = toMember(entry);
const details: Details = { championMasteries: [], matches: [], activeGame: null, failures: [] };
function fixture() {
  const roster = { list: vi.fn(async () => [entry]), add: vi.fn(async () => null), update: vi.fn(async () => null), remove: vi.fn(async () => null) };
  const lol = { lookup: vi.fn<LolData['lookup']>(async () => base), overview: vi.fn<LolData['overview']>(async () => base),
    details: vi.fn<LolData['details']>(async () => details) };
  return { roster, lol, model: createRosterModel({ roster, lol, newId: () => 'new' }) };
}

it('초기 조회를 공유하고 구독 해제 후 알리지 않으며 서버 snapshot은 고정한다', async () => {
  const { model, roster } = fixture();
  const server = model.getServerSnapshot();
  expect(model.getSnapshot()).toBe(model.getSnapshot());
  const listener = vi.fn();
  const unsubscribe = model.subscribe(listener);
  await Promise.all([model.load(), model.load()]);
  expect(roster.list).toHaveBeenCalledTimes(1);
  expect(model.getSnapshot()).toMatchObject({ members: [base], isLoading: false, error: null });
  expect(model.getServerSnapshot()).toBe(server);
  unsubscribe(); listener.mockClear(); model.dismissError();
  expect(listener).not.toHaveBeenCalled();
});

it('초기 목록 실패는 이유를 유지하고 수동 재시도로 복구한다', async () => {
  const { model, roster } = fixture();
  roster.list.mockRejectedValueOnce(new RosterRequestError(401, null));
  await model.load();
  expect(model.getSnapshot()).toMatchObject({ isLoading: false, members: [] });
  expect(model.getSnapshot().error).toContain('로그인');
  await model.refreshAll();
  expect(model.getSnapshot()).toMatchObject({ members: [base], error: null });
});

it('오래 걸린 이전 갱신이 최신 결과나 로딩 상태를 덮어쓰지 않는다', async () => {
  const { model, lol } = fixture();
  await model.load();
  const older = deferred<typeof base>();
  lol.overview.mockImplementationOnce(() => older.promise).mockResolvedValueOnce({ ...base, leaguePoints: 99 });
  const first = model.refreshAll();
  await model.refreshAll();
  expect(model.getSnapshot().isLoading).toBe(true);
  older.resolve({ ...base, leaguePoints: 1 }); await first;
  expect(model.getSnapshot().members[0].leaguePoints).toBe(99);
  expect(model.getSnapshot().isLoading).toBe(false);
});

it('진행 중에 계정을 편집하면 이전 계정의 응답은 적용하지 않는다', async () => {
  const { model, lol } = fixture();
  await model.load();
  const pending = deferred<Details | null>();
  lol.details.mockImplementationOnce(() => pending.promise);
  const read = model.loadDetails(base);
  await model.updateMember({ ...base, gameName: 'new-name' });
  pending.reject(new Error('old account failed')); await read;
  expect(model.getSnapshot().members[0]).toMatchObject({ gameName: 'new-name' });
  expect(model.getSnapshot().members[0].detailsError).toBeUndefined();
});

it('같은 계정의 최신 상세 성공 뒤 늦게 실패한 이전 요청은 무시한다', async () => {
  const { model, lol } = fixture();
  await model.load();
  const older = deferred<Details | null>();
  lol.details.mockImplementationOnce(() => older.promise);
  const first = model.loadDetails(base);
  await model.loadDetails(base);
  older.reject(new Error('late failure')); await first;
  expect(model.getSnapshot().members[0].detailsError).toBeUndefined();
});

it('부분 실패는 기존 숙련도를 보존하고 다음 성공에서 실패 표시를 지운다', async () => {
  const { model, lol } = fixture();
  await model.load();
  const mastery = { championId: 103, championName: 'Ahri', championLevel: 7, championPoints: 100, lastPlayTime: 1 };
  lol.details.mockResolvedValueOnce({ ...details, championMasteries: [mastery] })
    .mockResolvedValueOnce({ ...details, failures: ['mastery', 'matches'] });
  await model.loadDetails(base); await model.loadDetails(base);
  expect(model.getSnapshot().members[0]).toMatchObject({ championMasteries: [mastery], matchesUnavailable: true });
  expect(model.getSnapshot().members[0].detailsError).toContain('숙련도');
  await model.loadDetails(base);
  expect(model.getSnapshot().members[0]).toMatchObject({ championMasteries: [], matchesUnavailable: false });
  expect(model.getSnapshot().members[0].detailsError).toBeUndefined();
});

it('저장 실패 후 서버 목록으로 복구하고 성공 갱신으로 실패 안내를 지우지 않는다', async () => {
  const { model, roster, lol } = fixture();
  await model.load();
  roster.add.mockRejectedValueOnce(new RosterRequestError(409, null));
  lol.overview.mockClear();
  await model.addMember({ ...base, gameName: 'new-account' });
  expect(model.getSnapshot().members).toEqual([base]);
  expect(model.getSnapshot().error).toContain('이미 등록');
  expect(lol.overview).not.toHaveBeenCalled();
});

it('이전 저장의 실패 복구는 그 뒤에 시작된 편집을 삭제하지 않는다', async () => {
  const { model, roster } = fixture();
  await model.load();
  const earlier = deferred<null>();
  roster.update.mockImplementationOnce(() => earlier.promise);
  const first = model.updateMember({ ...base, gameName: 'earlier' });
  await model.updateMember({ ...base, gameName: 'latest' });
  earlier.reject(new RosterRequestError(500, null)); await first;
  expect(model.getSnapshot().members[0].gameName).toBe('latest');
  expect(model.getSnapshot().error).toContain('이후 변경은 유지');
});

it('검색 입력을 정규화하고 중복 Riot ID를 다시 저장하지 않는다', async () => {
  const { model, roster, lol } = fixture();
  await model.load();
  await model.searchSummoner(' friend ', ' #kr1 ');
  expect(lol.lookup).toHaveBeenCalledWith('friend', 'KR1');
  await expect(model.searchSummoner('', 'KR1')).rejects.toThrow('소환사명');
  expect(await model.addMember({ ...base, gameName: 'FRIEND', tagLine: 'kr1' })).toBe(false);
  expect(roster.add).not.toHaveBeenCalled();
});
