#!/usr/bin/env node
// .github/workflows를 CI와 같은 도구·버전으로 로컬에서 검사한다: actionlint(CI의 workflow-policy)와 zizmor(Security scan의 analyze (actions)).
// 버전·체크섬은 workflow 파일에서 읽어 CI와 따로 놀지 않는다(Dependabot·사람이 CI 쪽만 바꿔도 같이 따라간다).
// 받은 도구는 캐시 디렉터리에 버전별로 두고 다시 받지 않는다. 비밀값은 쓰지 않는다. Linux x64 전용(CI·클라우드 세션과 같음).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function toolVersions(ciYaml, securityYaml) {
  const actionlint = /actionlint\/releases\/download\/v([\d.]+)\/actionlint_\1_linux_amd64\.tar\.gz/.exec(ciYaml);
  const sha = /printf '%s {2}%s\\n' '([0-9a-f]{64})' '\/tmp\/actionlint\.tar\.gz'/.exec(ciYaml);
  const zizmor = /zizmor==([\d.]+)/.exec(securityYaml);
  if (!actionlint || !sha) throw new Error('ci.yml에서 actionlint 버전·체크섬을 찾지 못했습니다. workflow-policy 작업의 설치 줄 형식이 바뀌었는지 확인하세요.');
  if (!zizmor) throw new Error('security.yml에서 zizmor==<버전>을 찾지 못했습니다. 보안 도구 설치 줄 형식이 바뀌었는지 확인하세요.');
  return { actionlint: { version: actionlint[1], sha256: sha[1] }, zizmor: { version: zizmor[1] } };
}

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', ...opts }).status ?? 1;


function ensureActionlint(dir, { version, sha256 }) {
  const bin = path.join(dir, 'actionlint');
  if (existsSync(bin)) return bin;
  mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, 'actionlint.tar.gz');
  const url = `https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_linux_amd64.tar.gz`;
  if (run('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '3', '--max-time', '60', url, '-o', archive]) !== 0)
    throw new Error(`actionlint ${version} 다운로드 실패(네트워크·프록시 확인).`);
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
  if (actual !== sha256) { rmSync(archive); throw new Error(`actionlint 체크섬 불일치(기대 ${sha256}, 실제 ${actual}). 받은 파일을 지웠습니다.`); }
  if (run('tar', ['-xzf', archive, '-C', dir, 'actionlint']) !== 0) throw new Error('actionlint 압축 해제 실패.');
  rmSync(archive);
  return bin;
}

function ensureZizmor(dir, { version }) {
  const bin = path.join(dir, 'bin', 'zizmor');
  if (existsSync(bin)) return bin;
  if (run('python3', ['-m', 'venv', dir]) !== 0) throw new Error('python3 venv를 만들지 못했습니다(python3-venv 필요).');
  if (run(path.join(dir, 'bin', 'pip'), ['install', '--quiet', '--disable-pip-version-check', `zizmor==${version}`]) !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`zizmor ${version} 설치 실패(PyPI 접근 확인). 만든 venv를 지웠습니다.`);
  }
  return bin;
}

function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    console.error(`지원하지 않는 환경(${process.platform}/${process.arch}). CI·클라우드 세션과 같은 Linux x64에서 실행하세요.`);
    return 2;
  }
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  let versions;
  try {
    versions = toolVersions(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'), readFileSync(path.join(root, '.github/workflows/security.yml'), 'utf8'));
  } catch (error) { console.error(error.message); return 2; }
  const cache = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'jaemangho', 'workflow-lint');
  let actionlint, zizmor;
  try {
    actionlint = ensureActionlint(path.join(cache, `actionlint-${versions.actionlint.version}`), versions.actionlint);
    zizmor = ensureZizmor(path.join(cache, `zizmor-${versions.zizmor.version}`), versions.zizmor);
  } catch (error) { console.error(`도구 준비 실패: ${error.message}`); return 2; }
  console.log(`actionlint ${versions.actionlint.version}`);
  const a = run(actionlint, ['-color'], { cwd: root });
  console.log(`zizmor ${versions.zizmor.version}`);
  const z = run(zizmor, ['--offline', '--format', 'plain', '.github/workflows'], { cwd: root });
  if (a !== 0 || z !== 0) {
    console.error(`workflow 검사 실패: ${[a !== 0 && 'actionlint', z !== 0 && 'zizmor'].filter(Boolean).join(', ')}. 위 출력의 파일:줄을 고친 뒤 다시 실행하세요.`);
    return 1;
  }
  console.log('workflow 검사 통과(actionlint·zizmor)');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main());
