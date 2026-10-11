import { pathToFileURL } from 'node:url';

// HTTP 요청은 재전송하지 않는다. 응답 유실은 DB 잠금과 다음 예약 실행이 처리한다.
export async function recover({ url, secret, fetchFn = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const base = new URL(url);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid recovery URL');
  if (!secret) return { recovery: 'unconfigured', verified: false };
  let recovery;
  try {
    const response = await fetchFn(new URL('/api/cron/recovery', base), {
      headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(65_000),
    });
    if (!response.ok) return { recovery: `request_http_${response.status}`, verified: false };
    recovery = (await response.json()).recovery;
    if (!['not_needed', 'running', 'waiting', 'manual_required', 'exhausted', 'busy', 'success', 'partial', 'failed', 'budget_paused'].includes(recovery)) {
      return { recovery: 'invalid_response', verified: false };
    }
  } catch { return { recovery: 'request_failed', verified: false }; }
  // 실행 뒤 별도 요청으로 점검한다. 복구와 점검의 함수 실행 시간을 분리한다.
  let verified = false;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetchFn(new URL('/api/cron/ops', base), {
        headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) break;
      const result = await response.json();
      verified = result.skipped === false && Number.isInteger(result.active) && result.active >= 0;
      if (verified || result.skipped !== true || attempt === 2) break;
      await sleep((attempt + 1) * 1000);
    }
  } catch { /* 실행 결과는 DB에 남는다. 다음 점검을 기다린다. */ }
  return { recovery, verified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  recover({ url: process.argv[2], secret: process.env.CRON_SECRET }).then(result => {
    console.log(`[recovery] ${result.recovery}; verification=${result.verified ? 'complete' : 'pending'}`);
    if (!result.verified || !['success', 'partial', 'not_needed', 'waiting', 'running', 'busy', 'budget_paused'].includes(result.recovery)) process.exitCode = 1;
  }).catch(() => { console.error('[recovery] configuration failed'); process.exitCode = 1; });
}
