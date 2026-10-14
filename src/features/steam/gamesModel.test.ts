import { expect, it, vi } from 'vitest';
import { createGamesModel } from './gamesModel';
import { SteamApiError, type Recommendation, type MissionsResult } from './api';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const game: Recommendation = { appId: 10, name: 'Test Game', totalMinutes: 0, playedBy: 0, beginnerCount: 2,
  minMinutes: 0, maxMinutes: 0, score: 1, owners: 2, missingIds: [], reasons: ['test'], support: 'coop' };
const recommendation = { games: [game], excluded: [], totalCommon: 1, totalCandidates: 1, checked: 1, unverified: 0, recentUnavailable: [] };
const mission: MissionsResult = { state: 'complete', missions: [], totalPublic: 0, completedTogether: 0, unknownAchievements: 0, unavailableIds: [], missingIds: [] };
function fixture() {
  const api = { list: vi.fn(async () => [{ steamId: 'A', name: 'A', avatar: null }, { steamId: 'B', name: 'B', avatar: null }]),
    add: vi.fn(async () => ({ steamId: 'C', name: 'C', avatar: null })), remove: vi.fn(async () => null),
    games: vi.fn(async () => ({ games: [game], excluded: [] })), recommendations: vi.fn(async () => recommendation),
    missions: vi.fn(async () => mission) };
  return { api, model: createGamesModel(api, 'Test', () => 0) };
}

it('초기 목록 요청을 공유하고 실패 후 재시도로 복구한다', async () => {
  const { model, api } = fixture();
  api.list.mockRejectedValueOnce(new SteamApiError(503));
  await Promise.all([model.loadMembers(), model.loadMembers()]);
  expect(api.list).toHaveBeenCalledTimes(1);
  expect(model.getSnapshot().error).toContain('Steam 키');
  await model.loadMembers();
  expect(model.getSnapshot()).toMatchObject({ loading: false, error: null, members: [{ steamId: 'A' }, { steamId: 'B' }] });
  expect(model.getServerSnapshot()).toMatchObject({ loading: true, members: [], query: 'Test' });
});

it('요청 중 조건 변경과 중복 실행을 모듈 자체가 차단한다', async () => {
  const { model, api } = fixture();
  await model.loadMembers(); model.toggle('A'); model.toggle('B');
  const pending = deferred<typeof recommendation>();
  api.recommendations.mockImplementationOnce(() => pending.promise);
  const first = model.recommend();
  await model.recommend(); model.toggle('A'); model.setScope('unowned'); model.setPreference('fresh'); model.setQuery('new');
  expect(api.recommendations).toHaveBeenCalledTimes(1);
  expect(model.getSnapshot()).toMatchObject({ busy: 'recommend', selected: ['A', 'B'], scope: 'all', preference: 'balanced', query: 'Test' });
  pending.resolve(recommendation); await first;
  expect(model.getSnapshot().recommendations).toMatchObject({ ids: ['A', 'B'], scope: 'all' });
  expect(model.getSnapshot().busy).toBeNull();
});

it('선택·기준·검색 변경은 해당 결과와 뽑기·도전 결과를 무효화한다', async () => {
  const { model } = fixture();
  await model.loadMembers(); model.toggle('A'); model.toggle('B');
  await model.recommend(); model.draw(); await model.findMissions(game);
  expect(model.getSnapshot()).toMatchObject({ drawn: game, missionResult: { game, data: mission } });
  model.setQuery('other');
  expect(model.getSnapshot()).toMatchObject({ drawn: null, missionResult: null });
  model.setScope('any');
  expect(model.getSnapshot().recommendations).toBeNull();
  await model.compare(); model.toggle('A');
  expect(model.getSnapshot()).toMatchObject({ result: null, recommendations: null, selected: ['B'] });
});

it('실패는 빈 성공 결과가 되지 않고 오류 ID를 유지하며 재시도한다', async () => {
  const { model, api } = fixture();
  await model.loadMembers(); model.toggle('A');
  api.games.mockRejectedValueOnce(new SteamApiError(500, '12345678-1234-1234-1234-123456789abc'));
  await model.compare();
  expect(model.getSnapshot()).toMatchObject({ result: null, busy: null });
  expect(model.getSnapshot().error).toContain('12345678-');
  await model.compare();
  expect(model.getSnapshot()).toMatchObject({ error: null, result: { mode: 'common', ids: ['A'] } });
});

it('추가 요청 중 새로 입력한 값은 성공 응답이 지우지 않는다', async () => {
  const { model, api } = fixture(); await model.loadMembers();
  const pending = deferred<{ steamId: string; name: string; avatar: null }>();
  api.add.mockImplementationOnce(() => pending.promise);
  model.setInput('first'); const add = model.add(); model.setInput('next');
  pending.resolve({ steamId: 'C', name: 'C', avatar: null }); await add;
  expect(model.getSnapshot().input).toBe('next');
  expect(model.getSnapshot().members[0].steamId).toBe('C');
});

it('삭제와 페이지 변경은 선택·표시 결과를 일관되게 정리한다', async () => {
  const { model } = fixture(); await model.loadMembers(); model.toggle('A');
  await model.compare(); model.showMore();
  expect(model.getSnapshot().visibleLimit).toBe(100);
  model.setQuery(''); expect(model.getSnapshot().visibleLimit).toBe(50);
  await model.remove('A');
  expect(model.getSnapshot()).toMatchObject({ selected: [], result: null, members: [{ steamId: 'B' }] });
});
