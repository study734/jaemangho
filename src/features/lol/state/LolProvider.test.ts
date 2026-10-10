import { expect, it } from 'vitest';
import { needsLolData } from './LolProvider';

it('홈과 롤 화면에서만 소환사 자동 조회를 활성화한다', () => {
  for (const path of ['/', '/lol', '/lol/squad', '/lol/mastery']) expect(needsLolData(path)).toBe(true);
  for (const path of ['/steam', '/community', '/admin', '/people', '/lollipop']) expect(needsLolData(path)).toBe(false);
});
