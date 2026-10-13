import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const REPOSITORY = 'study734/jaemangho';
const ROOT = `repos/${REPOSITORY}`;
const measured = (value, unit, source, extra = {}) => ({ availability: 'measured', value, unit, source, ...extra });
const unavailable = (reason, source) => ({ availability: 'unavailable', value: null, reason, source });
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function elapsed(start, end) {
  const value = Date.parse(end) - Date.parse(start);
  return nonnegative(value) ? value : null;
}

export function summarizeRun(run, jobs, timing) {
  const executions = jobs.jobs ?? [];
  const durations = executions.map(job => elapsed(job.started_at, job.completed_at));
  const finished = run.status === 'completed' || typeof run.conclusion === 'string';
  const complete = finished && executions.length === jobs.total_count && durations.every(value => value !== null);
  const source = `/actions/runs/${run.id}/jobs`;
  const billable = Object.entries(timing?.billable ?? {});
  return {
    runId: run.id, workflowId: run.workflow_id, attempt: run.run_attempt, conclusion: run.conclusion,
    url: `https://github.com/${REPOSITORY}/actions/runs/${run.id}`,
    // Runner occupancy is wall time summed across parallel jobs, not CPU time.
    runnerOccupied: complete ? measured(durations.reduce((sum, value) => sum + value, 0), 'ms', source, { scope: 'latest_attempt' }) : unavailable('incomplete_job_timestamps_or_pagination', source),
    runDuration: finished && nonnegative(timing?.run_duration_ms) ? measured(timing.run_duration_ms, 'ms', `/actions/runs/${run.id}/timing`) : unavailable('timing_not_available_or_run_incomplete', source),
    // GitHub timing includes re-runs. It is not comparable to latest-attempt jobs.
    billableTime: finished && billable.length && billable.every(([, row]) => nonnegative(row.total_ms))
      ? measured(Object.fromEntries(billable.map(([os, row]) => [os, row.total_ms])), 'ms', `/actions/runs/${run.id}/timing`, { scope: 'includes_reruns', monetaryCost: false })
      : unavailable('billable_time_not_available', `/actions/runs/${run.id}/timing`),
    jobs: executions.map(job => ({ jobId: job.id, conclusion: job.conclusion,
      durationMs: elapsed(job.started_at, job.completed_at),
      // This includes dependencies as well as scheduling, so do not call it queue time.
      startLagFromRunCreatedMs: elapsed(run.created_at, job.started_at),
      steps: (job.steps ?? []).map(step => ({ number: step.number, conclusion: step.conclusion,
        durationMs: elapsed(step.started_at, step.completed_at) })),
    })),
  };
}

export async function githubJson(route) {
  try {
    if (process.env.GITHUB_TOKEN) {
      const response = await fetch(`https://api.github.com/${route}`, { redirect: 'error',
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`github_http_${response.status}`);
      return await response.json();
    }
    const { stdout } = await execute('gh', ['api', route], { timeout: 20_000, maxBuffer: 2_000_000 });
    return JSON.parse(stdout);
  } catch (error) {
    const status = /github_http_(\d{3})/.exec(error.message)?.[1] ?? /HTTP (\d{3})/.exec(error.stderr ?? '')?.[1];
    throw new Error(status ? `github_http_${status}` : 'github_query_failed');
  }
}

export async function collectProjectMeasurements({ read = githubJson, now = Date.now, limit = 10 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('limit must be 1..20');
  const started = now();
  const startClock = performance.now();
  const startCpu = process.cpuUsage();
  let apiReadCount = 0;
  const safe = async route => {
    apiReadCount++;
    try { return { data: await read(route) }; }
    catch (error) { return { failure: /^github_(?:http_\d{3}|query_failed)$/.test(error.message) ? error.message : 'source_unavailable' }; }
  };
  const since = new Date(started - 7 * 86400_000).toISOString();
  const runsResult = await safe(`${ROOT}/actions/runs?per_page=${limit}&created=${encodeURIComponent(`>=${since}`)}`);
  const runs = runsResult.data?.workflow_runs;
  const results = [];
  if (Array.isArray(runs)) for (const run of runs.slice(0, limit)) {
    const [jobs, timing] = await Promise.all([
      safe(`${ROOT}/actions/runs/${run.id}/jobs?per_page=100&filter=latest`),
      safe(`${ROOT}/actions/runs/${run.id}/timing`),
    ]);
    results.push(Array.isArray(jobs.data?.jobs) ? summarizeRun(run, jobs.data, timing.data)
      : { runId: run.id, availability: 'unavailable', reason: jobs.failure ?? 'invalid_jobs' });
  }
  const date = new Date(started);
  const [artifacts, billing] = await Promise.all([
    safe(`${ROOT}/actions/artifacts?per_page=100`),
    safe(`users/study734/settings/billing/usage?year=${date.getUTCFullYear()}&month=${date.getUTCMonth() + 1}`),
  ]);
  const items = artifacts.data?.artifacts;
  const storageComplete = Array.isArray(items) && items.length === artifacts.data.total_count
    && items.every(item => Number.isSafeInteger(item.size_in_bytes) && item.size_in_bytes >= 0);
  const usage = billing.data?.usageItems;
  const validUsage = Array.isArray(usage) && usage.every(item => item
    && ['date', 'product', 'sku', 'unitType'].every(key => typeof item[key] === 'string')
    && ['quantity', 'grossAmount', 'discountAmount', 'netAmount'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key])));
  const report = {
    schemaVersion: 1, generatedAt: date.toISOString(), repository: REPOSITORY,
    workflowCoverage: { since, limit, totalMatching: runsResult.data?.total_count ?? null,
      complete: Array.isArray(runs) && results.length === runsResult.data.total_count
        && results.every(result => result.runnerOccupied?.availability === 'measured' && result.runDuration?.availability === 'measured'),
      availability: Array.isArray(runs) ? 'measured' : 'unavailable', reason: runsResult.failure ?? null },
    workflows: results,
    artifactStorage: storageComplete ? measured(items.filter(item => !item.expired).reduce((sum, item) => sum + item.size_in_bytes, 0), 'byte', '/actions/artifacts', { monetaryCost: false })
      : unavailable(artifacts.failure ?? 'incomplete_artifact_pagination', '/actions/artifacts'),
    githubUsageCharges: validUsage ? {
      availability: 'measured', source: '/users/study734/settings/billing/usage', period: date.toISOString().slice(0, 7),
      // Provider usage charges are not a paid invoice. Do not invent a currency or allocate account-wide items.
      scope: 'repository_attributed_items_only', invoice: false, currency: null,
      items: usage.filter(item => ['jaemangho', REPOSITORY].includes(item.repositoryName)).map(item => ({
        date: item.date, product: item.product, sku: item.sku, quantity: item.quantity,
        unitType: item.unitType, grossAmount: item.grossAmount, discountAmount: item.discountAmount, netAmount: item.netAmount,
      })),
      unallocatedItemCount: usage.filter(item => !item.repositoryName).length,
    } : unavailable(billing.failure ?? 'invalid_billing_response', '/users/study734/settings/billing/usage'),
    gaps: [
      'agent_active_wait_and_rework_time_not_instrumented',
      'real_request_counts_failures_and_latency_not_instrumented',
      'db_acquisition_and_query_round_trip_not_instrumented',
      'external_api_latency_and_retries_not_instrumented',
      'vercel_cloudflare_costs_and_resources_not_collected',
      'neon_usage_exists_in_separate_usage_monitor',
    ],
    collector: { durationMs: Math.round(performance.now() - startClock), apiReadCount,
      nodeCpuMs: (() => { const cpu = process.cpuUsage(startCpu); return (cpu.user + cpu.system) / 1000; })(),
      rssAtEndBytes: process.memoryUsage().rss, outputLimitBytes: 100_000 },
  };
  if (Buffer.byteLength(JSON.stringify(report)) + 1 > 100_000) throw new Error('measurement_report_exceeds_budget');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--limit' || !/^\d+$/.test(args[1]))) throw new Error('usage: [--limit <1..20>]');
    const result = await collectProjectMeasurements({ limit: Number(args[1] ?? 10) });
    console.log(JSON.stringify(result));
    if (result.workflowCoverage.availability === 'unavailable') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
