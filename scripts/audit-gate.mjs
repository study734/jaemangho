#!/usr/bin/env node
// CI 의존성 보안 검사(npm audit --audit-level=high)를 대신한다. 다른 점은 아래 EXCEPTIONS의 권고만 만료일까지 건너뛰는 것 하나다.
// - 예외는 권고 ID 단위다. 같은 패키지의 다른 권고, 새 high·critical 권고는 그대로 실패한다.
// - 만료일이 지나면 예외가 꺼져 다시 실패한다(잊어도 영원히 무시되지 않는다). 수정판이 나와 권고가 사라지면 예외를 지우라고 알린다.
// - 예외 추가·연장은 CI 보안 규칙 변경이라 사람의 확인을 받는다(AGENTS.md). 사유·만료를 함께 적는다.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// 현재 예외 없음. GHSA-fc5q-39xc-vjpf(picomatch)는 2026-11-18 철회돼(보안 문제 아님) 지웠다.
export const EXCEPTIONS = [];

const BLOCKING = new Set(['high', 'critical']);
const advisoryId = (url) => /GHSA-[\w-]+$/.exec(url ?? '')?.[0] ?? null;

// npm audit --json(v2) 보고서에서 막아야 할 권고를 고른다. 의존 경로(via가 문자열)로만 걸린 패키지는 원인 권고에서 함께 판단한다.
export function evaluate(report, exceptions = EXCEPTIONS, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const active = new Map(exceptions.filter((e) => e.expires >= today).map((e) => [e.id, e]));
  const advisories = new Map();
  for (const [name, vulnerability] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || !via) continue;
      const id = advisoryId(via.url) ?? `${name}:${via.title}`;
      if (!advisories.has(id)) advisories.set(id, { id, name, severity: via.severity, title: via.title, range: via.range });
    }
  }
  const found = [...advisories.values()];
  return {
    blocking: found.filter((a) => BLOCKING.has(a.severity) && !active.has(a.id)),
    excepted: found.filter((a) => BLOCKING.has(a.severity) && active.has(a.id)),
    expired: exceptions.filter((e) => e.expires < today).map((e) => e.id),
    unused: [...active.keys()].filter((id) => !advisories.has(id)),
  };
}

function main(args) {
  const run = spawnSync('npm', ['audit', '--json', ...args], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(run.stdout); } catch {
    console.error('npm audit 결과를 읽지 못했습니다(네트워크·레지스트리 문제일 수 있음). 같은 명령을 다시 실행해 원인을 확인하세요.');
    return 2;
  }
  if (report.error) { console.error(`npm audit 실패: ${report.error.code ?? 'unknown'}`); return 2; }
  const result = evaluate(report);
  for (const a of result.excepted) {
    const e = EXCEPTIONS.find((x) => x.id === a.id);
    console.log(`예외(만료 ${e.expires}): ${a.id} ${a.name} ${a.range} — ${e.reason}`);
  }
  for (const id of result.expired) console.log(`만료된 예외: ${id} — 다시 검사 대상입니다. 수정판 적용 후 scripts/audit-gate.mjs에서 지우세요.`);
  for (const id of result.unused) console.log(`::warning::더 이상 보고되지 않는 예외: ${id} — scripts/audit-gate.mjs에서 지우세요.`);
  if (result.blocking.length) {
    for (const a of result.blocking) console.error(`차단: [${a.severity}] ${a.id} ${a.name} ${a.range} ${a.title}`);
    console.error(`high 이상 보안 권고 ${result.blocking.length}건. npm audit ${args.join(' ')}로 상세를 확인하세요.`);
    return 1;
  }
  console.log(`high 이상 차단 권고 없음(예외 ${result.excepted.length}건).`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
