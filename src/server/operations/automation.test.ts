import { describe, expect, it, vi } from 'vitest';
import { createAutomationReader } from './automation';
import { automationDiagnosis } from '../../lib/automation-status';

const now = Date.parse('2026-10-11T10:00:00Z');
const makeRun = (file: string, extra = {}) => ({ id: 10, head_branch: 'main', head_repository: { full_name: 'study734/jaemangho' },
  path: `.github/workflows/${file}`, event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
  updated_at: new Date(now - 3_600_000).toISOString(), created_at: new Date(now - 4_000_000).toISOString(), ...extra });
const metadata = () => vi.fn(async (url: string | URL | Request) => {
  const path = String(url);
  if (path.includes('/artifacts')) return Response.json({ total_count: 3, artifacts: [
    { name: 'production-backup-10', expired: false, size_in_bytes: 50, workflow_run: { id: 10, head_branch: 'main' } },
    { name: 'restore-verification-10', expired: false, size_in_bytes: 30, workflow_run: { id: 10, head_branch: 'main' } },
    { expired: true, size_in_bytes: 80 },
  ] });
  const file = path.includes('production-backup.yml') ? 'production-backup.yml' : path.includes('production-restore-check.yml') ? 'production-restore-check.yml' : 'smoke.yml';
  return Response.json({ workflow_runs: [makeRun(file)] });
});

describe('자동 운영 증거 조회', () => {
  it('공개 메타데이터 요청을 합치고 한 시간 동안 재사용하며 비밀값을 요청하지 않는다', async () => {
    const fetchFn = metadata();
    let clock = now;
    const read = createAutomationReader(fetchFn, () => clock);
    const [a, b] = await Promise.all([read(), read()]);
    expect(a).toEqual(b);
    expect(a.artifacts).toEqual({ available: true, bytes: 80, complete: true });
    expect(automationDiagnosis('backup', a, now).state).toBe('healthy');
    clock += 59 * 60_000;
    await read();
    expect(fetchFn).toHaveBeenCalledTimes(4);
    for (const call of fetchFn.mock.calls) expect(String(call[0])).toMatch(/^https:\/\/api.github.com\/repos\/study734\/jaemangho\//);
    clock += 2 * 60_000;
    await read();
    expect(fetchFn).toHaveBeenCalledTimes(8);
  });
  it('한 공급자 요청 실패는 성공한 다른 보호 결과를 지우지 않으며 15분간 실패 요청을 반복하지 않는다', async () => {
    const fetchFn = metadata();
    const original = fetchFn.getMockImplementation()!;
    fetchFn.mockImplementation(async url => String(url).includes('production-backup.yml') ? new Response('', { status: 403 }) : original(url));
    const read = createAutomationReader(fetchFn, () => now);
    const result = await read();
    expect(automationDiagnosis('backup', result, now).state).toBe('unknown');
    expect(automationDiagnosis('restore', result, now).state).toBe('healthy');
    await read();
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
  it('다른 저장소·브랜치·워크플로 성공을 신뢰하지 않고 부분 파일 목록을 총 사용량으로 표시하지 않는다', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => String(url).includes('/artifacts')
      ? Response.json({ total_count: 101, artifacts: [{ expired: false, size_in_bytes: 40 }] })
      : Response.json({ workflow_runs: [makeRun('production-backup.yml', { head_branch: 'preview' }), makeRun('production-backup.yml', { head_repository: { full_name: 'attacker/fork' } })] }));
    const result = await createAutomationReader(fetchFn, () => now)();
    expect(result.workflows.backup.lastSuccess).toBeNull();
    expect(automationDiagnosis('backup', result, now).state).toBe('attention');
    expect(result.artifacts).toEqual({ available: true, bytes: 40, complete: false });
  });
  it('최근 실패·생략과 실행 중을 이전 성공과 구분하고 오래된 조회는 정상으로 표시하지 않는다', async () => {
    const result = await createAutomationReader(metadata(), () => now)();
    result.workflows.backup.latest = { id: 20, at: new Date(now).toISOString(), status: 'completed', conclusion: 'failure' };
    expect(automationDiagnosis('backup', result, now).state).toBe('attention');
    result.workflows.backup.latest.conclusion = 'skipped';
    expect(automationDiagnosis('backup', result, now).label).toBe('실행 생략');
    result.workflows.backup.latest.status = 'in_progress';
    expect(automationDiagnosis('backup', result, now).state).toBe('running');
    expect(automationDiagnosis('restore', result, now + 76 * 60_000).state).toBe('unknown');
  });
  it('백업 실행 성공만으로 보호 정상이라고 하지 않고 저장된 파일이 있어야 한다', async () => {
    const result = await createAutomationReader(metadata(), () => now)();
    result.workflows.backup.artifactPresent = false;
    expect(automationDiagnosis('backup', result, now).label).toBe('보관 파일 없음');
    result.workflows.backup.artifactPresent = null;
    expect(automationDiagnosis('backup', result, now).state).toBe('unknown');
  });
  it('잘못된 사용량 응답을 0으로 표시하지 않는다', async () => {
    const result = await createAutomationReader(vi.fn().mockResolvedValue(Response.json({})), () => now)();
    expect(result.artifacts).toEqual({ available: false, bytes: null, complete: false });
    expect(automationDiagnosis('backup', result, now).state).toBe('unknown');
  });
});
