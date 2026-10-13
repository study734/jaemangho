import { describe, expect, it, vi } from 'vitest';
import { collectProjectMeasurements, elapsed, githubJson, summarizeRun } from './measure-project.mjs';

const start = '2026-10-13T00:00:00Z';
const end = '2026-10-13T00:01:00Z';
const run = { id: 1, workflow_id: 2, run_attempt: 2, created_at: start, conclusion: 'success' };
const job = { id: 3, started_at: start, completed_at: end, conclusion: 'success', steps: [{ number: 1, started_at: start, completed_at: end }] };

describe('측정값과 과금·누락의 구분', () => {
  it('병렬 작업의 러너 점유 시간과 실제 경과·과금 시간을 구분한다', () => {
    const result = summarizeRun(run, { total_count: 2, jobs: [job, { ...job, id: 4 }] }, { run_duration_ms: 60_000, billable: { UBUNTU: { total_ms: 0 } } });
    expect(result.runnerOccupied.value).toBe(120_000);
    expect(result.runDuration.value).toBe(60_000);
    expect(result.billableTime).toMatchObject({ value: { UBUNTU: 0 }, monetaryCost: false, scope: 'includes_reruns' });
  });
  it('미완료·역전된 시각과 누락된 작업을 0으로 처리하지 않는다', () => {
    expect(elapsed(start, null)).toBe(null);
    expect(elapsed(end, start)).toBe(null);
    expect(summarizeRun(run, { total_count: 2, jobs: [job] }, {}).runnerOccupied.value).toBe(null);
    expect(summarizeRun(run, { total_count: 1, jobs: [{ ...job, completed_at: null }] }, {}).runnerOccupied.value).toBe(null);
  });
  it('제한된 표본과 저장 용량의 페이지 누락, 청구 권한 실패를 명시한다', async () => {
    const read = async route => {
      if (route.includes('settings/billing')) throw new Error('github_http_404');
      if (route.includes('/artifacts')) return { total_count: 2, artifacts: [{ size_in_bytes: 100, expired: false }] };
      if (route.includes('/timing')) return {};
      if (route.includes('/jobs')) return { total_count: 1, jobs: [job] };
      return { total_count: 40, workflow_runs: [run] };
    };
    const report = await collectProjectMeasurements({ read, now: () => Date.parse(start), limit: 1 });
    expect(report.workflowCoverage.complete).toBe(false);
    expect(report.artifactStorage.value).toBe(null);
    expect(report.githubUsageCharges).toMatchObject({ availability: 'unavailable', value: null, reason: 'github_http_404' });
  });
  it('오류 원문·명령·계정 전체 청구값을 보고서로 복사하지 않는다', async () => {
    const read = async route => {
      if (route.includes('settings/billing')) {
        const fields = { date: start, product: 'Actions', sku: 'linux', quantity: 1, unitType: 'minute', grossAmount: 1, discountAmount: 0 };
        return { usageItems: [{ ...fields, repositoryName: 'other', netAmount: 999 }, { ...fields, repositoryName: 'jaemangho', netAmount: 1 }] };
      }
      if (route.includes('/artifacts')) return { total_count: 0, artifacts: [] };
      if (route.includes('/jobs')) throw new Error('secret-credential');
      if (route.includes('/timing')) return {};
      return { total_count: 1, workflow_runs: [run] };
    };
    const report = await collectProjectMeasurements({ read, now: () => Date.parse(start) });
    expect(JSON.stringify(report)).not.toContain('secret-credential');
    expect(report.githubUsageCharges.items).toHaveLength(1);
    expect(report.githubUsageCharges).toMatchObject({ invoice: false, currency: null });
    expect(report.artifactStorage).toMatchObject({ availability: 'measured', value: 0 });
    expect(report.workflowCoverage.complete).toBe(false);
    expect(report.collector.apiReadCount).toBe(5);
  });
  it('조회 상한을 강제한다', async () => {
    await expect(collectProjectMeasurements({ limit: 21 })).rejects.toThrow('1..20');
  });
  it('실행 중인 작업의 API 0을 완료 시간·과금 시간 0으로 처리하지 않는다', () => {
    const result = summarizeRun({ ...run, status: 'in_progress', conclusion: null }, { total_count: 0, jobs: [] }, { run_duration_ms: 0, billable: { UBUNTU: { total_ms: 0 } } });
    expect(result.runnerOccupied.value).toBe(null);
    expect(result.runDuration.value).toBe(null);
    expect(result.billableTime.value).toBe(null);
  });
  it('잘못된 청구 응답은 실측 금액으로 보고하지 않는다', async () => {
    const report = await collectProjectMeasurements({ read: async route => route.includes('settings/billing')
      ? { usageItems: [{ netAmount: 'unknown' }] } : route.includes('/artifacts') ? { total_count: 0, artifacts: [] } : { total_count: 0, workflow_runs: [] } });
    expect(report.githubUsageCharges).toMatchObject({ availability: 'unavailable', value: null, reason: 'invalid_billing_response' });
  });
  it('API가 요청한 상한보다 많은 실행을 반환해도 선택한 일부를 전체로 보고하지 않는다', async () => {
    const read = async route => route.includes('settings/billing') ? { usageItems: [] }
      : route.includes('/artifacts') ? { total_count: 0, artifacts: [] }
      : route.includes('/timing') ? { run_duration_ms: 60_000 }
      : route.includes('/jobs') ? { total_count: 1, jobs: [job] }
      : { total_count: 2, workflow_runs: [run, { ...run, id: 5 }] };
    const result = await collectProjectMeasurements({ read, limit: 1 });
    expect(result.workflows).toHaveLength(1);
    expect(result.workflowCoverage.complete).toBe(false);
  });
  it('workflow의 기존 토큰으로 읽고 리디렉션에 토큰을 전달하지 않는다', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'fixture-only-token');
    vi.stubGlobal('fetch', async (url, options) => {
      expect(url).toBe('https://api.github.com/repos/study734/jaemangho/actions/runs');
      expect(options.redirect).toBe('error');
      expect(options.headers.Authorization).toBe('Bearer fixture-only-token');
      return Response.json({ total_count: 0, workflow_runs: [] });
    });
    try { expect(await githubJson('repos/study734/jaemangho/actions/runs')).toMatchObject({ total_count: 0 }); }
    finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it('workflow API 권한 실패는 상태 코드만 남기고 응답 본문은 숨긴다', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'fixture-only-token');
    vi.stubGlobal('fetch', async () => new Response('private-billing-response', { status: 403 }));
    try { await expect(githubJson('users/study734/settings/billing/usage')).rejects.toThrow(/^github_http_403$/); }
    finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it('보관 예산보다 큰 보고서는 업로드할 출력으로 만들지 않는다', async () => {
    const read = async route => route.includes('settings/billing') ? { usageItems: [] }
      : route.includes('/artifacts') ? { total_count: 0, artifacts: [] }
      : route.includes('/timing') ? { run_duration_ms: 60_000 }
      : route.includes('/jobs') ? { total_count: 1, jobs: [{ ...job, steps: Array.from({ length: 3000 }, (_, number) => ({ number, conclusion: 'success', started_at: start, completed_at: end })) }] }
      : { total_count: 1, workflow_runs: [run] };
    await expect(collectProjectMeasurements({ read })).rejects.toThrow('measurement_report_exceeds_budget');
  });
});
