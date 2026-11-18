import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PROJECT, TEAM } from './deployment-guard.mjs';
import { probeSmoke } from './smoke.mjs';

const execute = promisify(execFile);
const SITE = 'https://jaemangho.vercel.app';
const shaOf = deployment => deployment?.meta?.githubCommitSha ?? deployment?.gitSource?.sha;
const validSha = sha => /^[a-f0-9]{40}$/.test(sha ?? '');

// A healthy previous release must never prove that the requested change shipped.
// Only public checks are performed; authenticated UI/external flows remain separate.
export async function verifyProduction({ commit, inspect, candidates, fetchFn = fetch, probe = probeSmoke }) {
  if (!validSha(commit)) throw new Error('invalid_commit');
  const before = await inspect();
  if ((before.projectId ?? before.project?.id) !== PROJECT || before.target !== 'production'
    || before.meta?.githubCommitRef !== 'main' || !validSha(shaOf(before))) {
    return { status: 'inspection_failed', reason: 'unexpected_production_target' };
  }
  if (shaOf(before) !== commit || before.readyState !== 'READY') {
    const list = await candidates(commit);
    const target = list.deployments?.find(d => shaOf(d) === commit);
    return {
      status: ['ERROR', 'CANCELED', 'BLOCKED'].includes(target?.readyState ?? target?.state) ? 'deployment_failed' : 'not_serving_commit',
      expectedCommit: commit, servingCommit: shaOf(before),
      candidate: target ? { id: target.uid ?? target.id, state: target.readyState ?? target.state, errorCode: target.errorCode } : null,
    };
  }
  const observations = new Map();
  const freshFetch = async (input, init) => {
    const url = new URL(input);
    url.searchParams.set('release_check', randomUUID());
    const started = performance.now();
    try {
      const response = await fetchFn(url, init);
      observations.set(url.pathname, { httpStatus: response.status, elapsedMs: Math.round(performance.now() - started), cache: response.headers.get('x-vercel-cache') });
      return response;
    } catch {
      observations.set(url.pathname, { failure: 'network_or_timeout', elapsedMs: Math.round(performance.now() - started) });
      throw new Error('public_probe_failed');
    }
  };
  const checks = (await probe(SITE, freshFetch)).map(check => ({ ...check, ...observations.get(check.path) }));
  const after = await inspect();
  if (after.id !== before.id || shaOf(after) !== commit || after.readyState !== 'READY') {
    return { status: 'deployment_changed', expectedCommit: commit, checks };
  }
  return { status: checks.every(check => check.ok) ? 'public_verified' : 'public_checks_failed',
    expectedCommit: commit, deploymentId: before.id, checks, authenticatedFlow: 'not_checked' };
}

// --api: Vercel CLI 로그인 없이 Vercel REST API를 직접 부른다. 클라우드 개발 세션은 프록시가 api.vercel.com 인증을 넣어 주므로
// 토큰 자리에는 자리표시 값만 보낸다(실제 비밀값을 받거나 출력하지 않는다). 로컬은 기존처럼 CLI 로그인을 쓴다.
export function parseArguments(input) {
  const api = input.includes('--api');
  const args = input.filter(arg => arg !== '--api');
  const [flag, value, waitFlag, seconds] = args;
  if (!['--commit', '--pr'].includes(flag) || !value
    || (flag === '--commit' && !validSha(value)) || (flag === '--pr' && !/^[1-9]\d*$/.test(value))
    || (args.length !== 2 && (args.length !== 4 || waitFlag !== '--wait' || !/^\d+$/.test(seconds) || Number(seconds) > 300))) {
    throw new Error('usage: --commit <40-character SHA> | --pr <number> [--wait <0..300 seconds>] [--api]');
  }
  return { [flag.slice(2)]: value, waitSeconds: Number(seconds ?? 0), ...(api ? { api: true } : {}) };
}

async function cliJson(command, args) {
  try {
    const { stdout } = await execute(command, args, { timeout: 30_000, maxBuffer: 2_000_000 });
    return JSON.parse(stdout);
  } catch {
    // CLI stderr and response bodies can contain secrets; report only the stage.
    throw new Error(command === 'gh' ? 'github_inspection_failed' : 'vercel_inspection_failed');
  }
}

async function apiJson(route) {
  try {
    const response = await fetch(`https://api.vercel.com${route}`, { headers: { Authorization: 'Bearer proxy-injected' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('http');
    return await response.json();
  } catch {
    // 응답 본문·헤더는 비밀값을 담을 수 있어 단계만 알린다.
    throw new Error('vercel_inspection_failed');
  }
}

export async function runVerification(options, { read = cliJson, readApi = apiJson, verify = verifyProduction,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let commit = options.commit;
  if (options.pr) {
    const pr = await read('gh', ['api', `repos/study734/jaemangho/pulls/${options.pr}`]);
    if (!pr.merged || !validSha(pr.merge_commit_sha)) return { status: 'not_merged', pr: options.pr };
    commit = pr.merge_commit_sha;
  }
  const api = options.api ? readApi : route => read('npm', ['exec', '--yes', '--package=vercel@63.1.2', '--', 'vercel', 'api', route, '--scope', TEAM]);
  const inspect = () => api(`/v13/deployments/jaemangho.vercel.app?teamId=${TEAM}&withGitRepoInfo=true`);
  const candidates = sha => api(`/v6/deployments?projectId=${PROJECT}&target=production&sha=${sha}&limit=5&teamId=${TEAM}`);
  const started = now();
  let result;
  do {
    result = await verify({ commit, inspect, candidates });
    const pending = result.status === 'not_serving_commit' && (!result.candidate
      || ['BUILDING', 'QUEUED', 'INITIALIZING'].includes(result.candidate.state));
    if (!pending || now() - started >= options.waitSeconds * 1000) break;
    await sleep(Math.min(5000, options.waitSeconds * 1000 - (now() - started)));
  } while (true);
  return { ...result, elapsedMs: now() - started };
}

// Node의 fetch는 HTTPS_PROXY를 기본으로 따르지 않는다. 클라우드 세션은 프록시로만 밖에 나갈 수 있으므로(직접 연결은 403)
// --api일 때 NODE_USE_ENV_PROXY=1로 자신을 한 번 다시 실행한다. 프록시가 없는 로컬에서는 그대로 실행한다.
function rerunWithEnvProxy(argv, env) {
  if (!argv.includes('--api') || !(env.HTTPS_PROXY || env.https_proxy) || env.NODE_USE_ENV_PROXY === '1') return null;
  const child = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...argv.slice(1)], { stdio: 'inherit', env: { ...env, NODE_USE_ENV_PROXY: '1' } });
  return child.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rerun = rerunWithEnvProxy(process.argv, process.env);
  if (rerun !== null) process.exit(rerun);
  try {
    const result = await runVerification(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'public_verified') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    if (error.message === 'vercel_inspection_failed' && !process.argv.includes('--api'))
      console.error('Vercel CLI 로그인이 없으면 실패합니다. 클라우드 개발 세션(프록시가 api.vercel.com 인증)에서는 같은 명령 끝에 --api를 붙이세요. 로컬은 vercel login 뒤 다시 실행하세요.');
    process.exitCode = 1;
  }
}
