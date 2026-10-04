import type { OwnedGame } from './client';

export interface Entry {
  appId: number;
  name: string;
  owners: number;
  totalMinutes: number;
}

// 선택한 모두(공개 목록을 가진 사람들)가 가진 게임, 합산 플레이 시간순
export function commonGames(libraries: OwnedGame[][]): Entry[] {
  const byApp = new Map<number, Entry>();
  for (const lib of libraries) {
    for (const g of lib) {
      const e = byApp.get(g.appId) ?? { appId: g.appId, name: g.name, owners: 0, totalMinutes: 0 };
      e.owners += 1;
      e.totalMinutes += g.minutes;
      byApp.set(g.appId, e);
    }
  }
  return [...byApp.values()].filter((e) => e.owners === libraries.length).sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name));
}

// 모두가 가졌지만 아무도 해 보지 않은(플레이 0분) 게임
export const unplayedByAll = (libraries: OwnedGame[][]): Entry[] => commonGames(libraries).filter((e) => e.totalMinutes === 0);
