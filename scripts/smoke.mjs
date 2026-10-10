import { appendFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function probeSmoke(url, fetchFn = fetch) {
  const base = new URL(url);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid URL');
  const checks = [
    ['/api/health', async (r) => r.status === 200 && (await r.json()).ok === true],
    ['/login', async (r) => r.status === 200 && (r.headers.get('content-type') ?? '').includes('text/html')],
    ['/', async (r) => {
      const target = new URL(r.headers.get('location') ?? '', base);
      return [302, 303, 307, 308].includes(r.status) && target.origin === base.origin && target.pathname === '/login';
    }],
    ['/api/members', async (r) => r.status === 401],
    ['/api/admin', async (r) => r.status === 401],
  ];
  return Promise.all(checks.map(async ([path, valid]) => {
    try {
      const response = await fetchFn(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'Cache-Control': 'no-cache' } });
      const ok = await valid(response);
      await response.body?.cancel().catch(() => {});
      return { path, ok };
    } catch { return { path, ok: false }; }
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  for (let attempt = 0; attempt < 5; attempt++) {
    result = await probeSmoke(process.argv[2]);
    if (result.every((r) => r.ok)) break;
    if (attempt < 4) await sleep(10_000);
  }
  const report = result.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.path}`).join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Production smoke\n\n\`\`\`text\n${report}\n\`\`\`\n`);
  if (result.some((r) => !r.ok)) process.exitCode = 1;
}
