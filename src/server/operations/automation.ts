import { AUTOMATION_WORKFLOWS, type AutomationEvidence, type AutomationKind, type AutomationRun } from '../../lib/automation-status';

const REPOSITORY = 'study734/jaemangho';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function run(value: unknown, kind: AutomationKind): AutomationRun | null {
  const row = record(value);
  const repo = record(row.head_repository);
  if (repo.full_name !== REPOSITORY || row.head_branch !== 'main' || row.path !== `.github/workflows/${AUTOMATION_WORKFLOWS[kind].file}`
    || !['schedule', 'workflow_dispatch', 'deployment_status'].includes(String(row.event))
    || !Number.isSafeInteger(row.id) || Number(row.id) <= 0 || typeof row.status !== 'string') return null;
  const at = row.status === 'completed' ? row.updated_at : row.created_at;
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  return { id: Number(row.id), at, status: row.status, conclusion: typeof row.conclusion === 'string' ? row.conclusion : null };
}

// 실행 메타데이터(실행 상태, 보관 파일 이름·크기)만 조회한다. 백업 내용·DB 주소는 가져오지 않는다.
// 저장소가 비공개라 토큰 없는 조회는 404다. GITHUB_ACTIONS_READ_TOKEN(이 저장소의 Actions 읽기만 허용한
// fine-grained 토큰)이 있으면 Authorization 헤더에만 넣는다. 토큰은 주소·로그·응답에 남기지 않는다.
export function createAutomationReader(fetchFn: typeof fetch = fetch, clock = Date.now,
  token: () => string | undefined = () => process.env.GITHUB_ACTIONS_READ_TOKEN || undefined) {
  let cached: AutomationEvidence | undefined;
  let expires = 0;
  let pending: Promise<AutomationEvidence> | undefined;
  async function inspect(): Promise<AutomationEvidence> {
    const now = clock();
    const secret = token();
    const get = async (route: string) => {
      const response = await fetchFn(`https://api.github.com/repos/${REPOSITORY}/${route}`, {
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'jaemangho-operations-dashboard', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      });
      if (!response.ok) throw new Error('metadata_unavailable');
      return record(await response.json());
    };
    const kinds = Object.keys(AUTOMATION_WORKFLOWS) as AutomationKind[];
    const workflows = {} as AutomationEvidence['workflows'];
    const results = await Promise.allSettled(kinds.map(async kind => {
      const data = await get(`actions/workflows/${AUTOMATION_WORKFLOWS[kind].file}/runs?branch=main&per_page=20`);
      if (!Array.isArray(data.workflow_runs)) throw new Error('metadata_invalid');
      const runs = data.workflow_runs.map(value => run(value, kind)).filter((value): value is AutomationRun => value !== null)
        .sort((a, b) => b.id - a.id);
      return { available: true, latest: runs[0] ?? null, lastSuccess: runs.find(r => r.status === 'completed' && r.conclusion === 'success') ?? null };
    }));
    results.forEach((result, index) => { workflows[kinds[index]] = result.status === 'fulfilled' ? result.value : { available: false, latest: null, lastSuccess: null }; });
    let artifacts: AutomationEvidence['artifacts'] = { available: false, bytes: null, complete: false };
    try {
      const data = await get('actions/artifacts?per_page=100');
      if (!Array.isArray(data.artifacts) || !Number.isSafeInteger(data.total_count) || Number(data.total_count) < data.artifacts.length) throw new Error('metadata_invalid');
      let bytes = 0;
      for (const value of data.artifacts) {
        const artifact = record(value);
        if (typeof artifact.expired !== 'boolean' || !Number.isSafeInteger(artifact.size_in_bytes) || Number(artifact.size_in_bytes) < 0) throw new Error('metadata_invalid');
        if (!artifact.expired) bytes += Number(artifact.size_in_bytes);
      }
      artifacts = { available: true, bytes, complete: data.total_count === data.artifacts.length };
      for (const kind of ['backup', 'restore'] as const) {
        const id = workflows[kind].lastSuccess?.id;
        const prefix = kind === 'backup' ? 'production-backup' : 'restore-verification';
        const present = id !== undefined && data.artifacts.some(value => {
          const artifact = record(value);
          const owner = record(artifact.workflow_run);
          return !artifact.expired && artifact.name === `${prefix}-${id}` && owner.id === id && owner.head_branch === 'main';
        });
        workflows[kind].artifactPresent = present ? true : artifacts.complete ? false : null;
      }
    } catch { /* 사용량을 모르면 정상·0으로 표시하지 않는다. */ }
    return { checkedAt: new Date(now).toISOString(), workflows, artifacts };
  }
  return async () => {
    if (cached && clock() < expires) return cached;
    if (pending) return pending;
    pending = inspect().then(result => {
      cached = result;
      const complete = result.artifacts.available && Object.values(result.workflows).every(w => w.available);
      expires = clock() + (complete ? 60 : 15) * 60_000;
      return result;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
export const automationStatus = createAutomationReader();
