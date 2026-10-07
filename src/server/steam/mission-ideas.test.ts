import { expect, it } from 'vitest';
import { buildMissionIdeas } from './mission-ideas';
const definitions = ['first', 'catch', 'done', 'unknown', 'secret'].map(id => ({ id, title: id, description: null, hidden: id === 'secret' }));
it('공개된 과제의 확실한 진행도만 비교한다', () => {
  const result = buildMissionIdeas([...definitions, definitions[0]], [
    { steamId: 'a', achievements: [{ id: 'first', unlocked: false }, { id: 'catch', unlocked: true }, { id: 'done', unlocked: true }] },
    { steamId: 'b', achievements: [{ id: 'first', unlocked: false }, { id: 'catch', unlocked: false }, { id: 'done', unlocked: true }] },
  ]);
  expect(result).toMatchObject({ totalPublic: 4, completedTogether: 1, unknownAchievements: 1, missions: [
    { id: 'catch', kind: 'catch-up', unlockedIds: ['a'], lockedIds: ['b'] },
    { id: 'first', kind: 'team-first', unlockedIds: [], lockedIds: ['a', 'b'] },
  ] });
});
it('목표를 최대 12개만 반환한다', () => {
  const defs = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: String(i), description: null, hidden: false }));
  const achievements = defs.map(d => ({ id: d.id, unlocked: false }));
  expect(buildMissionIdeas(defs, [{ steamId: 'a', achievements }, { steamId: 'b', achievements }]).missions).toHaveLength(12);
});
