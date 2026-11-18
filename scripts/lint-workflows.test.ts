import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toolVersions } from './lint-workflows.mjs';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const security = readFileSync('.github/workflows/security.yml', 'utf8');

describe('lint:workflows 도구 버전', () => {
  it('CI가 실제로 쓰는 actionlint 버전·체크섬과 zizmor 버전을 workflow 파일에서 읽는다', () => {
    const v = toolVersions(ci, security);
    expect(v.actionlint.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.actionlint.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ci).toContain(`actionlint_${v.actionlint.version}_linux_amd64.tar.gz`);
    expect(security).toContain(`zizmor==${v.zizmor.version}`);
  });

  it('설치 줄 형식이 바뀌어 버전을 못 찾으면 고칠 곳을 알려 주며 실패한다', () => {
    expect(() => toolVersions('jobs: {}', security)).toThrow('ci.yml에서 actionlint 버전·체크섬을 찾지 못했습니다');
    expect(() => toolVersions(ci, 'pip install semgrep==1')).toThrow('security.yml에서 zizmor==<버전>을 찾지 못했습니다');
  });
});
