import type { Member } from '../types';

// 소환사 목록(식별 정보만). 티어/전적은 Riot에서 매번 받아오므로 저장하지 않는다.
export interface RosterEntry {
  id: string;
  gameName: string;
  tagLine: string;
  ownerId?: string | null; // 안 보내면 그대로(등록 때는 등록자), null이면 주인 없음
}

async function call<T = null>(url: string, method: string, body?: RosterEntry): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export const rosterApi = {
  list: () => call<RosterEntry[]>('/api/members', 'GET'),
  add: (e: RosterEntry) => call('/api/members', 'POST', e),
  update: (e: RosterEntry) => call('/api/members', 'PUT', e),
  remove: (id: string) => call(`/api/members?id=${encodeURIComponent(id)}`, 'DELETE'),
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
