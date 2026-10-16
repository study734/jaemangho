import { expect, it, vi } from 'vitest';
import { emptyTaste } from './personalTypes';
import { createTasteModel } from './tasteModel';

const settings = { taste: emptyTaste(), members: [], catalog: [], tags: [] };
const deps = () => ({ settings: vi.fn(async () => settings), save: vi.fn(async taste => ({ taste })), clear: vi.fn(async () => ({})) });

it('keeps edits out of saved recommendation data until an explicit successful save', async () => {
  const api = deps(), model = createTasteModel(api); await model.load();
  model.setTaste({ ...emptyTaste(), likes: ['puzzle'] });
  expect(api.save).not.toHaveBeenCalled(); expect(model.getSnapshot().saved).toEqual(emptyTaste());
  api.save.mockRejectedValueOnce(new Error('저장 실패')); await model.save();
  expect(model.getSnapshot()).toMatchObject({ error: '저장 실패', taste: { likes: ['puzzle'] }, saved: emptyTaste() });
  await model.save(); expect(model.getSnapshot().saved.likes).toEqual(['puzzle']);
});

it('prevents duplicate writes and late state updates after leaving the screen', async () => {
  const api = deps(); let finish!: (value: { taste: ReturnType<typeof emptyTaste> }) => void;
  api.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const model = createTasteModel(api); await model.load(); model.setTaste({ ...emptyTaste(), likes: ['puzzle'] });
  const saving = model.save(); await model.save(); await model.clear();
  expect(api.save).toHaveBeenCalledTimes(1); expect(api.clear).not.toHaveBeenCalled();
  model.cancel(); finish({ taste: emptyTaste() }); await saving;
  expect(model.getSnapshot().taste.likes).toEqual(['puzzle']);
});
