import { describe, expect, it } from 'vitest';
import { PROJECT } from './deployment-guard.mjs';
import { parseArguments, runVerification, verifyProduction } from './verify-production.mjs';

const commit = 'a'.repeat(40);
const deployment = (sha = commit) => ({ id: 'dpl_active', projectId: PROJECT, target: 'production', readyState: 'READY', meta: { githubCommitRef: 'main', githubCommitSha: sha } });
const healthy = input => {
  const url = new URL(input);
  expect(url.searchParams.has('release_check')).toBe(true);
  if (url.pathname === '/api/health') return Response.json({ ok: true }, { headers: { 'x-vercel-cache': 'MISS' } });
  if (url.pathname === '/login') return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
  if (url.pathname === '/') return new Response(null, { status: 307, headers: { location: '/login' } });
  return new Response(null, { status: 401 });
};

describe('대상 커밋의 운영 반영 검증', () => {
  it('이전 버전이 정상이더라도 새 커밋의 배포 실패를 성공으로 처리하지 않는다', async () => {
    const result = await verifyProduction({ commit, inspect: async () => deployment('b'.repeat(40)),
      candidates: async () => ({ deployments: [{ uid: 'dpl_failed', state: 'ERROR', errorCode: 'git_info_fail', meta: { githubCommitSha: commit } }] }),
      probe: async () => { throw new Error('must not probe the previous release'); } });
    expect(result).toMatchObject({ status: 'deployment_failed', candidate: { errorCode: 'git_info_fail' } });
  });
  it('캐시를 우회한 공개 검사만 통과 처리하고 로그인 뒤 흐름은 미검증으로 남긴다', async () => {
    const result = await verifyProduction({ commit, inspect: async () => deployment(), fetchFn: healthy });
    expect(result.status).toBe('public_verified');
    expect(result.authenticatedFlow).toBe('not_checked');
    expect(result.checks).toHaveLength(5);
    expect(result.checks.find(c => c.path === '/api/health')).toMatchObject({ httpStatus: 200, cache: 'MISS' });
  });
  it('공개 API가 인증 없이 데이터를 반환하면 실패한다', async () => {
    const result = await verifyProduction({ commit, inspect: async () => deployment(),
      fetchFn: async input => new URL(input).pathname === '/api/members' ? Response.json([]) : healthy(input) });
    expect(result.status).toBe('public_checks_failed');
    expect(result.checks.find(c => c.path === '/api/members')).toMatchObject({ ok: false, httpStatus: 200 });
  });
  it('검사 도중 배포가 바뀌면 이전 결과로 완료하지 않는다', async () => {
    let count = 0;
    const result = await verifyProduction({ commit, inspect: async () => ++count === 1 ? deployment() : { ...deployment(), id: 'dpl_replaced' }, fetchFn: healthy });
    expect(result.status).toBe('deployment_changed');
  });
  it('다른 프로젝트는 공개 요청 전에 거부한다', async () => {
    const result = await verifyProduction({ commit, inspect: async () => ({ ...deployment(), projectId: 'other' }),
      probe: async () => { throw new Error('must not probe'); } });
    expect(result.status).toBe('inspection_failed');
  });
  it('네트워크 예외의 비밀값을 출력 결과에 포함하지 않는다', async () => {
    const result = await verifyProduction({ commit, inspect: async () => deployment(), fetchFn: async () => { throw new Error('secret-credential'); } });
    expect(result.status).toBe('public_checks_failed');
    expect(JSON.stringify(result)).not.toContain('secret-credential');
  });
  it('머지 전 PR은 배포 조회를 시작하지 않는다', async () => {
    const calls = [];
    const result = await runVerification({ pr: '75', waitSeconds: 0 }, { read: async (...args) => { calls.push(args); return { merged: false }; } });
    expect(result.status).toBe('not_merged');
    expect(calls).toHaveLength(1);
  });
  it('머지 커밋으로 준비 중 배포만 기다리고 실패 배포는 즉시 종료한다', async () => {
    let time = 0, count = 0;
    const result = await runVerification({ pr: '75', waitSeconds: 20 }, {
      read: async () => ({ merged: true, merge_commit_sha: commit }), now: () => time, sleep: async ms => { time += ms; },
      verify: async options => { expect(options.commit).toBe(commit); return { status: ++count === 1 ? 'not_serving_commit' : 'deployment_failed' }; },
    });
    expect(result).toMatchObject({ status: 'deployment_failed', elapsedMs: 5000 });
    expect(count).toBe(2);
  });
  it('대기 기한에 종료하고 같은 조건으로 무한 재시도하지 않는다', async () => {
    let time = 0;
    const result = await runVerification({ commit, waitSeconds: 6 }, { now: () => time, sleep: async ms => { time += ms; }, verify: async () => ({ status: 'not_serving_commit' }) });
    expect(result).toMatchObject({ status: 'not_serving_commit', elapsedMs: 6000 });
  });
  it('이미 완료된 다른 버전은 기다리며 반복 조회하지 않는다', async () => {
    const result = await runVerification({ commit, waitSeconds: 300 }, {
      verify: async () => ({ status: 'not_serving_commit', candidate: { state: 'READY' } }),
      sleep: async () => { throw new Error('must not wait for an already completed release'); },
    });
    expect(result.status).toBe('not_serving_commit');
  });
  it.each([[], ['--commit', 'abc'], ['--pr', '1; echo unsafe'], ['--pr', '75', '--wait', '301']].map(args => ({ args })))('인자를 검증한다: $args', ({ args }) => {
    expect(() => parseArguments(args)).toThrow('usage:');
  });
  it('PR 또는 전체 SHA와 제한된 대기 인자를 전달한다', () => {
    expect(parseArguments(['--pr', '75', '--wait', '120'])).toEqual({ pr: '75', waitSeconds: 120 });
    expect(parseArguments(['--commit', commit])).toEqual({ commit, waitSeconds: 0 });
  });
  it('--api는 CLI 대신 Vercel REST API로 같은 경로를 조회하고, GitHub 조회는 그대로 둔다', async () => {
    expect(parseArguments(['--pr', '137', '--wait', '120', '--api'])).toEqual({ pr: '137', waitSeconds: 120, api: true });
    expect(parseArguments(['--api', '--commit', commit])).toEqual({ commit, waitSeconds: 0, api: true });
    expect(parseArguments(['--commit', commit])).toEqual({ commit, waitSeconds: 0 });
    const reads = [], routes = [];
    const result = await runVerification({ pr: '137', waitSeconds: 0, api: true }, {
      read: async (...args) => { reads.push(args[0]); return { merged: true, merge_commit_sha: commit }; },
      readApi: async route => { routes.push(route); return deployment(); },
      verify: async ({ inspect, candidates }) => { await inspect(); await candidates(commit); return { status: 'public_verified' }; },
    });
    expect(result.status).toBe('public_verified');
    expect(reads).toEqual(['gh']);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatch(/^\/v13\/deployments\/jaemangho\.vercel\.app\?teamId=/);
    expect(routes[1]).toContain(`sha=${commit}`);
  });
});
