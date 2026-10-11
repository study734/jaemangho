import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { probeSmoke } from './smoke.mjs';

export const PROJECT = 'prj_mvcC7PWv6QstTX2blIJLFQgKZ4aJ';
export const TEAM = 'team_pDPXKxQmweWaDOLhvaiBQ9N1';
const SITE = 'https://jaemangho.vercel.app';
const shaOf = d => d?.meta?.githubCommitSha ?? d?.gitSource?.sha;
const trusted = d => (d?.projectId ?? d?.project?.id) === PROJECT && d.target === 'production' && d.readyState === 'READY' && /^dpl_[a-zA-Z0-9]+$/.test(d.id)
  && /^[a-f0-9]{40}$/.test(shaOf(d) ?? '') && d.meta?.githubCommitRef === 'main'
  && d.meta?.githubCommitOrg === 'study734' && d.meta?.githubCommitRepo === 'jaemangho';
const deploymentUrl = d => typeof d.url === 'string' && /^[a-zA-Z0-9-]+\.vercel\.app$/.test(d.url) ? `https://${d.url}` : null;
export function schemaCompatible(a, b) {
  if (![a, b].every(sha => /^[a-f0-9]{40}$/.test(sha))) return false;
  try { return !execFileSync('git', ['diff', '--name-only', a, b, '--', 'migrations'], { encoding: 'utf8' }).trim(); }
  catch { return false; }
}
export async function guardDeployment({ token, state = {}, persist = async () => {}, fetchFn = fetch, probe = probeSmoke,
  compatible = schemaCompatible, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), rollbackEnabled = false }) {
  if (!token) return { status: 'manual_required', reason: 'vercel_token_missing' };
  const api = async (route, method = 'GET') => {
    const url = new URL(route, 'https://api.vercel.com'); url.searchParams.set('teamId', TEAM);
    if (url.pathname.startsWith('/v13/deployments/')) url.searchParams.set('withGitRepoInfo', 'true');
    const response = await fetchFn(url, { method, redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`vercel_http_${response.status}`);
    const body = await response.text();
    return body ? JSON.parse(body) : {};
  };
  const currentDeployment = () => api('/v13/deployments/jaemangho.vercel.app');
  let current;
  try { current = await currentDeployment(); } catch { return { status: 'manual_required', reason: 'vercel_inspection_failed' }; }
  if (!trusted(current)) return { status: 'manual_required', reason: 'untrusted_production_target' };
  const isHealthy = async url => (await probe(url, fetchFn)).every(check => check.ok);
  // 한 번의 실패로 되돌리지 않는다. 현재 공개 배포를 3회 확인한다.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isHealthy(SITE)) {
      const after = await currentDeployment();
      if (after.id !== current.id) return { status: 'superseded', reason: 'deployment_changed' };
      await persist({ ...state, good: { id: current.id, sha: shaOf(current), checkedAt: Date.now() } });
      return { status: 'healthy', deploymentId: current.id };
    }
    if (attempt < 2) await sleep(5000);
  }
  if (!rollbackEnabled) return { status: 'manual_required', reason: 'rollback_policy_disabled', deploymentId: current.id };
  if (!state.good || state.good.id === current.id) return { status: 'manual_required', reason: 'verified_previous_deployment_missing' };
  if (state.attempted?.id === current.id) return { status: 'manual_required', reason: 'rollback_already_attempted' };
  let previous;
  try {
    const candidates = await api(`/v6/deployments?projectId=${PROJECT}&target=production&rollbackCandidate=true&limit=5`);
    const candidate = candidates.deployments?.find(d => (d.uid ?? d.id) !== current.id);
    if ((candidate?.uid ?? candidate?.id) !== state.good.id) return { status: 'manual_required', reason: 'previous_not_rollback_candidate' };
    previous = await api(`/v13/deployments/${state.good.id}`);
  } catch { return { status: 'manual_required', reason: 'previous_inspection_failed' }; }
  const previousUrl = deploymentUrl(previous);
  if (!trusted(previous) || !previousUrl || shaOf(previous) !== state.good.sha || !compatible(state.good.sha, shaOf(current))) {
    return { status: 'manual_required', reason: 'previous_or_schema_not_safe' };
  }
  // 동일 DB를 쓰는 이전 버전도 실패하면 DB·외부 기반 문제이므로 코드를 되돌리지 않는다.
  if (!await isHealthy(previousUrl)) return { status: 'manual_required', reason: 'previous_unhealthy_or_protected' };
  if ((await currentDeployment()).id !== current.id) return { status: 'superseded', reason: 'deployment_changed' };
  const nextState = { ...state, attempted: { id: current.id, previousId: previous.id, at: Date.now() } };
  await persist(nextState); // 응답 유실에도 동일 롤백을 다시 요청하지 않는다.
  try { await api(`/v1/projects/${PROJECT}/rollback/${previous.id}`, 'POST'); }
  catch { /* 응답 유실 시 공개 별칭으로 실제 결과를 확인한다. */ }
  let restored = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await currentDeployment()).id === previous.id && await isHealthy(SITE)) { restored = true; break; }
    await sleep(5000);
  }
  if (!restored) return { status: 'manual_required', reason: 'rollback_verification_failed' };
  // 검증한 동일 이전 버전만 재승격해 다음 main push의 자동 공개를 재개한다.
  if ((await currentDeployment()).id !== previous.id) return { status: 'manual_required', reason: 'deployment_changed_after_rollback' };
  try { await api(`/v10/projects/${PROJECT}/promote/${previous.id}`, 'POST'); }
  catch { return { status: 'manual_required', reason: 'rollback_succeeded_auto_assignment_pending' }; }
  if ((await currentDeployment()).id !== previous.id || !await isHealthy(SITE)) return { status: 'manual_required', reason: 'promotion_verification_failed' };
  await persist({ ...nextState, good: { id: previous.id, sha: state.good.sha, checkedAt: Date.now() } });
  return { status: 'recovered', deploymentId: previous.id, failedDeploymentId: current.id };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = '.ops-release/state.json';
  let state = {};
  try { state = JSON.parse(await readFile(file, 'utf8')); } catch { /* 첫 실행은 정상 버전 등록부터 한다. */ }
  const persist = async next => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 }); await rename(`${file}.tmp`, file); };
  guardDeployment({ token: process.env.VERCEL_TOKEN, state, persist, rollbackEnabled: process.env.OPS_AUTO_ROLLBACK === '1' }).then(result => {
    console.log(JSON.stringify(result));
    if (!['healthy', 'recovered', 'superseded'].includes(result.status)) process.exitCode = 1;
  }).catch(() => { console.error('[release] inspection or verification failed; operator intervention required'); process.exitCode = 1; });
}
