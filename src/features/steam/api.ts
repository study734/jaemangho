// Steam 멤버 목록과 게임 비교. 호출은 서버(/api/steam/*)가 대신하고, 키는 브라우저에 오지 않는다.
export interface SteamMember {
  steamId: string;
  name: string;
  avatar: string | null;
}
export interface GameEntry {
  appId: number;
  name: string;
  totalMinutes: number;
}
export interface GamesResult {
  games: GameEntry[];
  excluded: string[];
}
export type Mode = 'common' | 'unplayed';
export type Preference = 'balanced' | 'familiar' | 'fresh';
export type OwnershipScope = 'all' | 'any' | 'unowned';
export interface Recommendation extends GameEntry {
  playedBy: number;
  beginnerCount: number;
  minMinutes: number;
  maxMinutes: number;
  score: number | null;
  owners: number;
  missingIds: string[];
  reasons: string[];
  support: 'coop' | 'multiplayer';
}
export interface RecommendationsResult {
  games: Recommendation[];
  excluded: string[];
  totalCommon: number;
  totalCandidates: number;
  checked: number;
  unverified: number;
}

export class SteamApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`Steam API failed: ${status}`);
    this.status = status;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new SteamApiError(res.status);
  return (res.status === 204 ? null : await res.json()) as T;
}

export const steamApi = {
  list: () => call<SteamMember[]>('/api/steam/members'),
  add: (input: string) =>
    call<SteamMember>('/api/steam/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    }),
  setOwner: (steamId: string, ownerId: string | null) =>
    call<null>('/api/steam/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamId, ownerId }),
    }),
  remove: (steamId: string) => call<null>(`/api/steam/members?id=${encodeURIComponent(steamId)}`, { method: 'DELETE' }),
  games: (ids: string[], mode: Mode) => call<GamesResult>(`/api/steam/games?ids=${ids.join(',')}&mode=${mode}`),
  recommendations: (ids: string[], preference: Preference, scope: OwnershipScope = 'all') =>
    call<RecommendationsResult>(`/api/steam/recommendations?${new URLSearchParams({ ids: ids.join(','), preference, scope })}`),
};

const MESSAGES: Record<number, string> = {
  400: '올바른 Steam 프로필 주소나 ID가 아닙니다.',
  404: 'Steam에서 그 프로필을 찾지 못했습니다.',
  409: '이미 등록된 사람입니다.',
  502: 'Steam 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  503: 'Steam 키가 설정되지 않았습니다. 관리자에게 알려 주세요.',
};
export const steamErrorMessage = (e: unknown) =>
  e instanceof SteamApiError ? (MESSAGES[e.status] ?? `요청에 실패했습니다 (${e.status})`) : '요청에 실패했습니다.';
