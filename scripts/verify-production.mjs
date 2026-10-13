import { execFile } from 'node:child_process';
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

export function parseArguments(args) {
  const [flag, value, waitFlag, seconds] = args;
  if (!['--commit', '--pr'].includes(flag) || !value
    || (flag === '--commit' && !validSha(value)) || (flag === '--pr' && !/^[1-9]\d*$/.test(value))
    || (args.length !== 2 && (args.length !== 4 || waitFlag !== '--wait' || !/^\d+$/.test(seconds) || Number(seconds) > 300))) {
    throw new Error('usage: --commit <40-character SHA> | --pr <number> [--wait <0..300 seconds>]');
  }
  return { [flag.slice(2)]: value, waitSeconds: Number(seconds ?? 0) };
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

export async function runVerification(options, { read = cliJson, verify = verifyProduction,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let commit = options.commit;
  if (options.pr) {
    const pr = await read('gh', ['api', `repos/study734/jaemangho/pulls/${options.pr}`]);
    if (!pr.merged || !validSha(pr.merge_commit_sha)) return { status: 'not_merged', pr: options.pr };
    commit = pr.merge_commit_sha;
  }
  const api = route => read('npm', ['exec', '--yes', '--package=vercel@63.1.2', '--', 'vercel', 'api', route, '--scope', TEAM]);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runVerification(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'public_verified') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
