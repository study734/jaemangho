import type { Member } from '../types';

// 소환사 목록(식별 정보만). 티어/전적은 Riot에서 매번 받아오므로 저장하지 않는다.
export interface RosterEntry {
  id: string;
  gameName: string;
  tagLine: string;
  ownerId?: string | null; // 안 보내면 그대로(등록 때는 등록자), null이면 주인 없음
}

export class RosterRequestError extends Error {
  status: number;
  requestId: string | null;
  constructor(status: number, requestId: string | null) {
    super(`소환사 목록 요청 실패 (HTTP ${status})${requestId ? ` 오류 ID: ${requestId}` : ''}`);
    this.status = status;
    this.requestId = requestId;
  }
}

export function rosterFailureMessage(error: unknown) {
  if (!(error instanceof RosterRequestError)) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  const reason = error.status === 401 ? '로그인이 만료됐습니다. 다시 로그인해 주세요.'
    : error.status === 403 ? '요청 권한을 확인해 주세요.'
      : error.status === 409 ? '이미 등록된 Riot ID입니다.'
        : `요청을 처리하지 못했습니다 (HTTP ${error.status}). 잠시 후 다시 시도해 주세요.`;
  return `${reason}${error.requestId ? ` 오류 ID: ${error.requestId}` : ''}`;
}

async function call<T = null>(url: string, method: string, body?: RosterEntry): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) {
    const id = res.headers.get('X-Request-ID');
    throw new RosterRequestError(res.status, id && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id) ? id : null);
  }
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
