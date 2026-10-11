import { pathToFileURL } from 'node:url';
const PROJECT = 'calm-cherry-01967053';
const API = `https://console.neon.tech/api/v2/projects/${PROJECT}`;
const REPORT = 'https://jaemangho.vercel.app/api/cron/usage';

// Free 플랜의 프로젝트 스냅샷만 읽는다. 유료 consumption-history API·DB 연결은 사용하지 않는다.
export async function collectUsage({ key, secret, fetchFn = fetch, now = Date.now }) {
  if (!secret) throw new Error('cron_unconfigured');
  let project;
  let errorCode = key ? 'neon_unavailable' : 'unconfigured';
  if (key) try {
    const response = await fetchFn(API, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (response.ok) { project = (await response.json()).project; errorCode = 'neon_invalid'; }
  } catch { /* 원문·인증 헤더를 출력하지 않고 조회 실패도 보고한다. */ }
  const at = new Date(now()).toISOString();
  const valid = project?.id === PROJECT && typeof project.consumption_period_start === 'string'
    && Number.isFinite(Date.parse(project.consumption_period_start)) && Date.parse(project.consumption_period_start) <= Date.parse(at)
    && [project.compute_time_seconds, project.data_transfer_bytes].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const sample = valid ? { at, periodStart: new Date(project.consumption_period_start).toISOString(), computeSeconds: project.compute_time_seconds, transferBytes: project.data_transfer_bytes } : null;
  const response = await fetchFn(REPORT, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ at, sample, errorCode: sample ? null : errorCode }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error('report_failed');
  const result = await response.json();
  if (!['normal', 'limited', 'paused'].includes(result.mode)) throw new Error('report_invalid');
  return { available: !!sample, mode: result.mode };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  collectUsage({ key: process.env.NEON_API_KEY, secret: process.env.CRON_SECRET }).then(result => {
    console.log(`[usage] ${result.available ? 'verified' : 'unavailable'}; collection=${result.mode}`);
    if (!result.available) process.exitCode = 1;
  }).catch(() => { console.error('[usage] report failed; previous protection retained'); process.exitCode = 1; });
}
