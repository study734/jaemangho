import { TRACKED, type TrackKey } from './track';

// 관리자 "개선 우선순위": 이미 쌓이는 관측 데이터(화면 열람, 서버 실패 횟수, Riot·Steam 오류, 채팅 동기화, 운영 경고)를
// 묶어 무엇을 고치거나 키울지 순서대로 보여준다. 계산은 순수 함수라 DB 없이 improvements.test.ts로 재현한다.
// 수집은 src/server/improvements.ts, 화면은 src/components/ImprovementPanel.tsx.

export interface ImprovementInput {
  // 최근 7일(current)과 그 전 7일(previous)의 화면별 열람 수
  views: { path: string; current: number; previous: number }[];
  // 최근 7일 서버 실패(app_failures)
  failures: { operation: string; code: string; count: number }[];
  // 최근 7일 Riot 오류 상태별 수(404 포함 원본; 계산에서 404는 제외)
  riotErrors: { status: number; count: number }[];
  // 최근 7일 Steam 오류 분류별 수(app_unavailable 제외해서 전달)
  steamErrors: { code: string; count: number }[];
  // 최근 7일 채팅 동기화의 실패·부분 완료 횟수
  chatJobs: { failed: number; partial: number };
  // 현재 활성 운영 경고
  alerts: { key: string; title: string; severity: 'warning' | 'critical' }[];
}

export type ImprovementKind = 'fix' | 'check' | 'grow' | 'review';
export const KIND_LABEL: Record<ImprovementKind, string> = { fix: '고치기', check: '살펴보기', grow: '키우기', review: '정리 검토' };

export interface Improvement {
  id: string;
  kind: ImprovementKind;
  target: string; // 영역 또는 화면 이름
  reasons: string[]; // 근거 문장(숫자 포함)
  next: string; // 다음 조치
  views: number; // 영향 범위: 관련 화면의 최근 7일 열람
}

export interface ImprovementReport {
  usageEnough: boolean; // 열람 수가 적으면 사용량 기반 판단(살펴보기·키우기·정리 검토)을 하지 않는다
  totalViews: { current: number; previous: number };
  items: Improvement[];
}

interface Area { id: string; label: string; paths: TrackKey[]; operations: string[]; alerts: string[] }

// 작업 이름(operation)·경고 키의 앞부분으로 영역을 정한다. 맞는 영역이 없으면 마지막 '운영' 영역에 넣는다.
// 새 기능의 serverError/reportFailure 작업 이름이 여기에 맞지 않으면 '운영·기타'로 보이므로 접두어를 추가한다.
export const AREAS: Area[] = [
  { id: 'lol', label: '롤', paths: ['/lol', '/lol/squad', '/lol/synergy', '/lol/mastery', '/lol/settings'], operations: ['api/riot', 'api/members', 'members.', 'riot.'], alerts: ['riot.'] },
  { id: 'steam', label: 'Steam', paths: ['/steam'], operations: ['api/steam', 'steam.'], alerts: ['steam.'] },
  { id: 'records', label: '홈·우리 기록', paths: ['/', '/play', '/memories', '/community', '/community/awards'],
    operations: ['api/discovery', 'api/discord', 'api/cron/chat', 'discovery.', 'home.', 'community.', 'chat.'], alerts: ['chat.'] },
  { id: 'people', label: '멤버', paths: ['/people', '/people/[id]'], operations: ['api/people', 'people.', 'profile.'], alerts: [] },
  { id: 'ops', label: '운영·기타', paths: ['/admin'], operations: [], alerts: [] },
];

// riot_errors·steam_errors에 이미 세는 외부 응답 실패. 서버 실패 수에서 빼서 두 번 세지 않는다.
const EXTERNAL_OPERATIONS = new Set(['riot.upstream', 'riot.response', 'steam.web-api']);

const MIN_VIEWS = 30; // 두 주 합계가 이보다 적으면 사용량 변화로 판단하지 않는다
const MIN_SCREEN = 10; // 화면별 변화를 볼 최소 열람 수
const CHANGE = 0.3; // 30% 이상 늘거나 줄면 표시

const areaOf = (key: string, pick: (a: Area) => string[]) =>
  AREAS.find((a) => pick(a).some((prefix) => key === prefix || key.startsWith(prefix))) ?? AREAS[AREAS.length - 1];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const percent = (now: number, before: number) => `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}%`;
const label = (path: string) => (TRACKED as Record<string, string>)[path] ?? path;

export function rankImprovements(input: ImprovementInput): ImprovementReport {
  const viewsByPath = new Map(input.views.map((v) => [v.path, v]));
  const areaViews = (area: Area) => sum(area.paths.map((p) => viewsByPath.get(p)?.current ?? 0));

  // 1) 고치기: 영역별 활성 경고·서버 실패·외부 오류
  const fixes = AREAS.map((area) => {
    const alerts = input.alerts.filter((a) => areaOf(a.key, (x) => x.alerts) === area);
    const failures = input.failures.filter((f) => !EXTERNAL_OPERATIONS.has(f.operation) && areaOf(f.operation, (x) => x.operations) === area)
      .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));
    const serverCount = sum(failures.map((f) => f.count));
    const reasons: string[] = [];
    const steps: string[] = [];
    let score = 0;

    for (const a of alerts) {
      reasons.push(`${a.severity === 'critical' ? '긴급 경고' : '경고'}: ${a.title}`);
      score += a.severity === 'critical' ? 1000 : 300;
    }
    if (serverCount > 0) {
      const top = failures.slice(0, 3).map((f) => `${f.operation}(${f.code}) ${f.count}회`).join(', ');
      reasons.push(`서버 실패 ${serverCount}회 · ${top}`);
      steps.push('서버 로그의 [failure]에서 작업 이름으로 오류 ID·위치를 확인');
      score += serverCount * 10;
    }
    if (area.id === 'lol') {
      const by = (match: (s: number) => boolean) => sum(input.riotErrors.filter((e) => match(e.status)).map((e) => e.count));
      const key = by((s) => s === 401 || s === 403), limit = by((s) => s === 429), upstream = by((s) => s >= 500);
      if (key) { reasons.push(`Riot 키 오류(401/403) ${key}회`); steps.push('Riot API 키 만료·형식 확인'); score += key * 5; }
      if (limit) { reasons.push(`Riot 호출 제한(429) ${limit}회`); steps.push('캐시 적중률과 호출이 몰리는 화면 확인'); score += limit; }
      if (upstream) { reasons.push(`Riot 서버 오류(5xx) ${upstream}회 · 외부 서비스 문제일 수 있음`); score += upstream; }
    }
    if (area.id === 'steam') {
      const count = sum(input.steamErrors.map((e) => e.count));
      if (count) {
        const top = [...input.steamErrors].sort((a, b) => b.count - a.count).slice(0, 3).map((e) => `${e.code} ${e.count}회`).join(', ');
        reasons.push(`Steam 요청 오류 ${count}회 · ${top}`);
        steps.push('관리자 연동 탭의 Steam 오류와 키 설정 확인');
        score += count;
      }
    }
    if (area.id === 'records' && input.chatJobs.failed + input.chatJobs.partial > 0) {
      reasons.push(`채팅 동기화 실패 ${input.chatJobs.failed}회 · 부분 완료 ${input.chatJobs.partial}회`);
      steps.push('관리자 연동 탭의 채팅 동기화 기록 확인');
      score += input.chatJobs.failed * 5 + input.chatJobs.partial * 2;
    }
    if (alerts.length && !steps.length) steps.push('관리자 개요 탭의 경고 안내를 따라 원인 해결');
    const views = areaViews(area);
    return { score, item: { id: `fix:${area.id}`, kind: 'fix' as const, target: area.label, reasons, next: steps.join(' · '), views } };
  }).filter((f) => f.score > 0)
    // 점수가 같으면 많이 쓰는 영역(영향이 큰 쪽)부터
    .sort((a, b) => b.score - a.score || b.item.views - a.item.views)
    .map((f) => f.item);

  // 2) 사용량 기반: 화면별 변화. 관리자 화면은 판단에서 뺀다.
  const screens = (Object.keys(TRACKED) as TrackKey[]).filter((p) => p !== '/admin')
    .map((path) => ({ path, current: viewsByPath.get(path)?.current ?? 0, previous: viewsByPath.get(path)?.previous ?? 0 }));
  const totalViews = { current: sum(input.views.map((v) => v.current)), previous: sum(input.views.map((v) => v.previous)) };
  const usageEnough = totalViews.current + totalViews.previous >= MIN_VIEWS;
  const usage: Improvement[] = [];
  if (usageEnough) {
    const byViews = (a: { current: number }, b: { current: number }) => b.current - a.current;
    for (const s of [...screens].sort((a, b) => b.previous - a.previous)) {
      if (s.previous >= MIN_SCREEN && s.current <= s.previous * (1 - CHANGE)) usage.push({
        id: `check:${s.path}`, kind: 'check', target: label(s.path), views: s.current,
        reasons: [`열람 ${s.previous}회 → ${s.current}회 (${percent(s.current, s.previous)})`],
        next: '최근 배포에서 이 화면의 동작·로딩이 바뀌었는지, 진입 링크가 사라졌는지 확인',
      });
    }
    for (const s of [...screens].sort(byViews)) {
      if (s.current >= MIN_SCREEN && s.current >= s.previous * (1 + CHANGE)) usage.push({
        id: `grow:${s.path}`, kind: 'grow', target: label(s.path), views: s.current,
        reasons: [s.previous ? `열람 ${s.previous}회 → ${s.current}회 (${percent(s.current, s.previous)})` : `새로 쓰이기 시작함: 열람 ${s.current}회`],
        next: '많이 쓰이는 화면: 관련 기능 확장·편의 개선 후보',
      });
    }
    for (const s of screens) {
      if (s.current + s.previous <= 2) usage.push({
        id: `review:${s.path}`, kind: 'review', target: label(s.path), views: s.current,
        reasons: [`최근 2주 열람 ${s.current + s.previous}회`],
        next: '진입 경로가 잘 보이는지 확인하고, 필요 없으면 정리 검토',
      });
    }
  }
  return { usageEnough, totalViews, items: [...fixes, ...usage] };
}
