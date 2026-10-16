import { describe, expect, it } from 'vitest';
import { discordPatchNotesText, PATCH_NOTES, patchNotesFor } from './patch-notes';

describe('PATCH_NOTES', () => {
  it('최신순이고 항목이 비어 있지 않다', () => {
    const dates = PATCH_NOTES.map(n => n.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(PATCH_NOTES.every(n => /^\d{4}-\d{2}-\d{2}$/.test(n.date) && n.items.length > 0)).toBe(true);
  });
  it('화면별로 나뉜다', () => {
    expect(patchNotesFor('web').every(n => n.area === 'web')).toBe(true);
    expect(discordPatchNotesText()).toContain('출처 찾기');
    expect(discordPatchNotesText()).not.toContain('디스코드 위젯');
  });
  it('디스코드 글자 한도를 넘지 않는다', () => {
    expect(discordPatchNotesText().length).toBeLessThanOrEqual(2000);
    expect(discordPatchNotesText(60).length).toBeLessThanOrEqual(60);
  });
});
