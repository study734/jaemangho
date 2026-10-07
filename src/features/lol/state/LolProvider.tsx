'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createLolData, type Overview, type Summoner } from '../api/lolData';
import { createRiotClient } from '../api/riot';
import { rosterApi, toMember } from '../api/roster';
import type { Member } from '../types';

// 롤 화면들이 공유하는 상태와 동작. 화면(페이지)은 이 인터페이스만 쓴다.
export interface LolState {
  members: Member[];
  isLoading: boolean;
  error: string | null;
  dismissError: () => void;
  refreshAll: () => Promise<void>;
  loadDetails: (member: Member) => Promise<void>;
  searchSummoner: (gameName: string, tagLine: string) => Promise<Summoner>;
  addMember: (data: Summoner) => void;
  updateMember: (member: Member) => void;
  removeMember: (id: string) => void;
  // 서버에서 이미 지운 소환사를 화면 상태에서도 뺀다 (관리자 화면용)
  forgetMember: (id: string) => void;
}

const LolContext = createContext<LolState | null>(null);

export function useLol(): LolState {
  const state = useContext(LolContext);
  if (!state) throw new Error('useLol must be used inside <LolProvider>');
  return state;
}

const lol = createLolData(createRiotClient());

export function LolProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rosterApi.list()
      .then((list) => {
        setMembers(list.map(toMember));
        setRosterReady(true);
      })
      .catch(() => { setIsLoading(false); setError('소환사 목록을 불러오지 못했습니다. 새로고침해 주세요.'); });
  }, []);

  // 저장 실패(중복 Riot ID, 세션 만료 등) 시 서버 기준으로 목록을 다시 맞춘다
  const persist = (p: Promise<unknown>) =>
    p.catch(async () => {
      setError('저장하지 못했습니다. 목록을 서버 기준으로 다시 불러옵니다.');
      try {
        const list = await rosterApi.list();
        setMembers((prev) => list.map((e) => ({ ...(prev.find((m) => m.id === e.id) ?? toMember(e)), gameName: e.gameName, tagLine: e.tagLine })));
      } catch { setError('저장과 목록 재조회에 실패했습니다. 새로고침으로 다시 확인해 주세요.'); }
    });

  // 목록 전체(또는 한 명)의 기본 정보(레벨/아이콘/랭크)를 갱신한다
  const refresh = async (target?: Member) => {
    setIsLoading(true);
    setError(null);

    const overviews: { [memberId: string]: Overview } = {};
    const failed: string[] = [];
    await Promise.all((target ? [target] : members).map(async (member) => {
      try {
        overviews[member.id] = await lol.overview(member);
      } catch (err) {
        failed.push(member.gameName);
        console.warn(`Failed to fetch real data for ${member.gameName}:`, err);
      }
    }));

    setMembers((prev) => prev.map((m) => (overviews[m.id] ? { ...m, ...overviews[m.id] } : m)));
    if (failed.length) setError(`${failed.join(', ')}의 최신 정보를 불러오지 못했습니다. 기존 정보를 표시합니다. 잠시 후 새로고침해 주세요.`);
    setIsLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (rosterReady) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterReady]);

  const state: LolState = {
    members,
    isLoading,
    error,
    dismissError: () => setError(null),
    refreshAll: async () => {
      if (rosterReady) return refresh();
      setIsLoading(true); setError(null);
      try {
        const list = await rosterApi.list();
        setMembers(list.map(toMember)); setRosterReady(true);
      } catch { setIsLoading(false); setError('소환사 목록을 불러오지 못했습니다. 새로고침해 주세요.'); }
    },

    // 상세 화면용 정보(숙련도/최근 매치/실시간 게임)를 클릭 시 불러온다
    loadDetails: async (target) => {
      try {
        const details = await lol.details(target);
        if (details) setMembers((prev) => prev.map((m) => (m.id === target.id ? { ...m, ...details } : m)));
      } catch (err) {
        console.warn(`Lazy load failed for ${target.gameName}`, err);
      }
    },

    // 소환사 검색 & 미리보기
    searchSummoner: async (gameName, tagLine) => {
      const name = gameName.trim();
      let tag = tagLine.trim().toUpperCase();
      if (tag.startsWith('#')) tag = tag.substring(1);
      if (!name || !tag) throw new Error('소환사명과 태그라인을 둘 다 입력해 주세요.');
      return lol.lookup(name, tag);
    },

    addMember: (data) => {
      const duplicate = members.some(
        (m) => m.gameName.toLowerCase() === data.gameName.toLowerCase() && m.tagLine.toLowerCase() === data.tagLine.toLowerCase()
      );
      if (duplicate) {
        alert('이미 목록에 있는 Riot ID입니다.');
        return;
      }

      const id = Math.random().toString(36).substring(2, 9);
      // 기본 틀만 만들고, 실제 전적은 Riot에서 받아와 채운다
      const member: Member = { ...toMember({ id, gameName: data.gameName, tagLine: data.tagLine }), ...data };
      setMembers((prev) => [member, ...prev]);
      persist(rosterApi.add({ id, gameName: member.gameName, tagLine: member.tagLine }));
      setTimeout(() => refresh(member), 50);
    },

    updateMember: (member) => {
      setMembers((prev) => prev.map((m) => (m.id === member.id ? member : m)));
      persist(rosterApi.update({ id: member.id, gameName: member.gameName, tagLine: member.tagLine }));
    },

    removeMember: (id) => {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      persist(rosterApi.remove(id));
    },

    forgetMember: (id) => setMembers((prev) => prev.filter((m) => m.id !== id)),
  };

  return <LolContext.Provider value={state}>{children}</LolContext.Provider>;
}
