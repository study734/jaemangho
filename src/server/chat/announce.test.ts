import { describe, expect, it } from 'vitest';
import { GUIDE, GUIDE_KEY, nextAnnouncement, noteKey } from './announce';
import type { PatchNote } from '../../lib/patch-notes';

// intent/0004 R5·R6: 무엇을 올릴지는 DB 없이 정한다.
const note = (date: string, title: string, items = ['항목']): PatchNote => ({ date, area: 'discord', title, items });
const notes = [note('2026-11-22', '새 기능 B'), note('2026-11-21', '새 기능 A')];

describe('nextAnnouncement', () => {
  it('처음 켜질 때는 지금까지의 패치노트를 건너뛰고 사용법 안내만 올린다', () => {
    const next = nextAnnouncement(notes, new Set(), true);
    expect(next.skip).toEqual(notes.map(noteKey));
    expect(next.post).toEqual({ key: GUIDE_KEY, covers: [GUIDE_KEY], content: GUIDE });
  });
  it('안내 버전을 아직 안 올렸으면 새 소식보다 안내를 먼저 올린다', () => {
    expect(nextAnnouncement(notes, new Set([noteKey(notes[1])]), false).post?.key).toBe(GUIDE_KEY);
  });
  it('알리지 않은 패치노트를 한 메시지로 묶고, 이미 알린 것은 다시 넣지 않는다', () => {
    const next = nextAnnouncement(notes, new Set([GUIDE_KEY, noteKey(notes[1])]), false);
    expect(next.skip).toEqual([]);
    expect(next.post?.covers).toEqual([noteKey(notes[0])]);
    expect(next.post?.content).toContain('새 기능 B');
    expect(next.post?.content).not.toContain('새 기능 A');
    expect(nextAnnouncement(notes, new Set([GUIDE_KEY, ...notes.map(noteKey)]), false).post).toBeNull();
  });
  it('2000자를 넘지 않게 담을 수 있는 만큼만 담고 나머지는 다음 공지로 남긴다', () => {
    const long = Array.from({ length: 6 }, (_, i) => note('2026-11-2' + i, `긴 기능 ${i}`, ['가'.repeat(500)]));
    const next = nextAnnouncement(long, new Set([GUIDE_KEY]), false);
    expect(next.post!.content.length).toBeLessThanOrEqual(2000);
    expect(next.post!.covers.length).toBeGreaterThan(0);
    expect(next.post!.covers.length).toBeLessThan(long.length);
  });
  it('안내는 디스코드 한도 안이고, 로그인 없이 쓸 수 있다는 것과 /의견을 알린다', () => {
    expect(GUIDE.length).toBeLessThanOrEqual(2000);
    for (const text of ['/의견', '/게임추천', '/모집', '/기록', '/전적', '/멤버', '/패치노트', '로그인 없이']) expect(GUIDE).toContain(text);
  });
});
