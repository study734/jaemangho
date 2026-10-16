import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// 새 화면을 만들고 셸(상단 바·하위 메뉴·설정 모달·로비)에 진입 링크를 빠뜨리면 사용자가 닿을 수 없다.
// #93에서 채널 목록을 걷을 때 /updates가 그렇게 사라졌다. 이 테스트가 같은 누락을 CI에서 막는다.
const APP = join(process.cwd(), 'src/app/(app)');
const SHELL_FILES = ['nav.tsx', 'TopBar.tsx', 'SettingsDialog.tsx', 'Lobby.tsx'].map(f => join(process.cwd(), 'src/components', f))
  .concat(join(APP, 'home.tsx'));

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === 'page.tsx' ? [path] : [];
  });
}

const routeOf = (file: string) => '/' + relative(APP, file).replace(/\\/g, '/').replace(/\/?page\.tsx$/, '');

// 셸 파일에 적힌 내부 링크(href: '/x', href="/x")를 모은다.
const linked = new Set(SHELL_FILES.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/href[=:]\s*['"{`]+(\/[^'"`}\s?#]*)/g)].map(m => m[1])));

describe('셸 진입 링크', () => {
  const targets = pages(APP).filter(file => {
    const route = routeOf(file);
    if (route.includes('[')) return false; // 목록에서 이어지는 동적 화면
    return !/\bredirect\(/.test(readFileSync(file, 'utf8')); // 다른 화면으로 보내는 별칭
  });

  it('화면 목록을 찾는다', () => {
    expect(targets.map(routeOf)).toEqual(expect.arrayContaining(['/', '/steam', '/lol', '/updates']));
  });

  it.each(targets.map(routeOf))('%s 로 가는 링크가 셸에 있다', route => {
    const home = route === '/';
    expect(home || linked.has(route), `${route} 화면으로 가는 링크가 nav.tsx·TopBar·SettingsDialog·Lobby·home.tsx 어디에도 없어요. 사용자가 닿을 수 있게 셸에 진입 링크를 추가하세요.`).toBe(true);
  });
});
