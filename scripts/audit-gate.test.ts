import { describe, expect, it } from 'vitest';
import { EXCEPTIONS, evaluate } from './audit-gate.mjs';

const advisory = (id: string, severity: string, title = 't', range = '*') => ({ source: 1, name: 'x', title, url: `https://github.com/advisories/${id}`, severity, range });
// npm audit --json(v2) 모양: 원인 패키지는 via에 권고 객체, 의존 경로로만 걸린 패키지는 via에 패키지 이름.
const report = (...entries: [string, unknown[]][]) => ({ vulnerabilities: Object.fromEntries(entries.map(([name, via]) => [name, { name, severity: 'high', via }])) });
const exception = { id: 'GHSA-aaaa-bbbb-cccc', expires: '2026-12-01', reason: 'test' };
const on = (day: string) => new Date(`${day}T12:00:00Z`);

describe('audit-gate', () => {
  it('예외 권고와 그 권고로만 걸린 의존 경로는 통과시키고, 같은 패키지의 다른 high 권고는 막는다', () => {
    const r = report(['picomatch', [advisory('GHSA-aaaa-bbbb-cccc', 'high'), advisory('GHSA-zzzz-zzzz-zzzz', 'critical')]], ['vite', ['picomatch']], ['vitest', ['vite', 'picomatch']]);
    const result = evaluate(r, [exception], on('2026-11-17'));
    expect(result.excepted.map((a) => a.id)).toEqual(['GHSA-aaaa-bbbb-cccc']);
    expect(result.blocking.map((a) => a.id)).toEqual(['GHSA-zzzz-zzzz-zzzz']);
  });

  it('만료일 다음 날부터 예외가 꺼져 다시 막는다(만료일 당일은 예외)', () => {
    const r = report(['picomatch', [advisory('GHSA-aaaa-bbbb-cccc', 'high')]]);
    expect(evaluate(r, [exception], on('2026-12-01')).blocking).toEqual([]);
    const after = evaluate(r, [exception], on('2026-12-02'));
    expect(after.blocking.map((a) => a.id)).toEqual(['GHSA-aaaa-bbbb-cccc']);
    expect(after.expired).toEqual(['GHSA-aaaa-bbbb-cccc']);
  });

  it('moderate 이하는 막지 않고, 더 이상 보고되지 않는 예외는 지우라고 알린다', () => {
    const result = evaluate(report(['minimatch', [advisory('GHSA-mmmm-mmmm-mmmm', 'moderate')]]), [exception], on('2026-11-17'));
    expect(result.blocking).toEqual([]);
    expect(result.unused).toEqual(['GHSA-aaaa-bbbb-cccc']);
  });

  it('등록된 예외는 GHSA ID·사유·만료일을 가진다', () => {
    for (const e of EXCEPTIONS) {
      expect(e.id).toMatch(/^GHSA-[\w]{4}-[\w]{4}-[\w]{4}$/);
      expect(e.reason.length).toBeGreaterThan(20);
      expect(e.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
