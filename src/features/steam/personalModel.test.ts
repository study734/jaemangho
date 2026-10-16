import { describe, expect, it, vi } from 'vitest';
import { createPersonalModel } from './personalModel';
import { emptyTaste, type PersonalResult, type TasteSettings } from './personalTypes';

const settings: TasteSettings = { taste: emptyTaste(), members: [{ steamId: 'one', name: '나', own: true }, { steamId: 'two', name: '친구', own: false }], catalog: [], tags: [] };
const result: PersonalResult = { kind: 'personal', games: [], excluded: [], recentUnavailable: [], people: 1, sharedPreferences: 0, catalogSize: 10, sourceGames: 0, metadataUnavailable: 0, groupExamples: [], capturedAt: '2026-10-16T00:00:00Z' };
const api = () => ({ settings: vi.fn().mockResolvedValue(settings), save: vi.fn(async taste => ({ taste })), clear: vi.fn().mockResolvedValue({}), recommend: vi.fn().mockResolvedValue(result) });
describe('personal recommendation state', () => {
  it('does not infer or recommend on load, selection or unsaved preference edits', async () => {
    const d = api(), model = createPersonalModel(d); await model.load();
    expect(model.getSnapshot().selected).toEqual(['one']);
    model.setKind('group'); model.setSelected(['one', 'two']); model.setTaste({ ...emptyTaste(), likes: ['puzzle'] });
    expect(d.save).not.toHaveBeenCalled(); expect(d.recommend).not.toHaveBeenCalled();
    await model.save(); expect(model.getSnapshot().saved.likes).toEqual(['puzzle']);
  });
  it('freezes request conditions and prevents duplicate operations while pending', async () => {
    const d = api(); let finish!: (value: PersonalResult) => void;
    d.recommend.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const model = createPersonalModel(d); await model.load(); const pending = model.recommend();
    model.setKind('group'); model.setSelected(['two']); await model.recommend(); await model.clear();
    expect(d.recommend).toHaveBeenCalledTimes(1); expect(d.clear).not.toHaveBeenCalled();
    finish(result); await pending;
    expect(model.getSnapshot()).toMatchObject({ kind: 'personal', selected: ['one'], result });
    model.setScope('new'); expect(model.getSnapshot().result).toBeNull();
  });
  it('ignores a late response after disposal and recovers failed requests manually', async () => {
    const d = api(); let finish!: (value: PersonalResult) => void;
    d.recommend.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const model = createPersonalModel(d); await model.load(); const pending = model.recommend();
    model.cancel(); finish(result); await pending; expect(model.getSnapshot().result).toBeNull();
    d.recommend.mockRejectedValueOnce(new Error('조회 실패')); await model.recommend(); expect(model.getSnapshot().error).toBe('조회 실패');
    await model.recommend(); expect(model.getSnapshot().error).toBe(''); expect(model.getSnapshot().result).toEqual(result);
  });
});
