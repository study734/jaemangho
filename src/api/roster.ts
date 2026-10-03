import type { Member } from '../types';

// 크루원 명단(식별 정보만). 티어/전적은 Riot에서 매번 받아오므로 저장하지 않는다.
// 배포 환경은 서버 DB(/api/members), 로컬 개발(vite만 실행)은 localStorage를 쓴다.
export interface RosterEntry {
  id: string;
  gameName: string;
  tagLine: string;
}

const DEV = import.meta.env.DEV;
const LS_KEY = 'jaemangho_roster';
const devList = (): RosterEntry[] => JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
const devSave = (list: RosterEntry[]) => localStorage.setItem(LS_KEY, JSON.stringify(list));

async function call(url: string, method: string, body?: RosterEntry) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export const rosterApi = {
  list: async (): Promise<RosterEntry[]> => (DEV ? devList() : call('/api/members', 'GET')),
  add: async (e: RosterEntry) => (DEV ? devSave([e, ...devList()]) : call('/api/members', 'POST', e)),
  update: async (e: RosterEntry) =>
    DEV ? devSave(devList().map((x) => (x.id === e.id ? e : x))) : call('/api/members', 'PUT', e),
  remove: async (id: string) =>
    DEV ? devSave(devList().filter((x) => x.id !== id)) : call(`/api/members?id=${encodeURIComponent(id)}`, 'DELETE'),
};

export const toMember = (e: RosterEntry): Member => ({
  ...e,
  summonerLevel: 0,
  profileIconId: 29,
  tier: 'UNRANKED',
  rank: '',
  leaguePoints: 0,
  wins: 0,
  losses: 0,
  activeGame: null,
  matches: [],
});
