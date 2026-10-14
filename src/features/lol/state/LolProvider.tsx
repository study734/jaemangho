'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createLolData, type Summoner } from '../api/lolData';
import { createRiotClient } from '../api/riot';
import { rosterApi } from '../api/roster';
import type { Member } from '../types';
import { createRosterModel } from './rosterModel';

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

export const needsLolData = (pathname: string) => pathname === '/' || pathname === '/lol' || pathname.startsWith('/lol/');

export function LolProvider({ children }: { children: ReactNode }) {
  const needsData = needsLolData(usePathname());
  const [model] = useState(() => createRosterModel({ roster: rosterApi, lol: createLolData(createRiotClient()) }));
  const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getServerSnapshot);
  useEffect(() => {
    if (needsData) void model.load();
  }, [needsData, model]);

  const state: LolState = {
    ...snapshot,
    dismissError: model.dismissError,
    refreshAll: model.refreshAll,
    loadDetails: model.loadDetails,
    searchSummoner: model.searchSummoner,
    addMember: data => { void model.addMember(data).then(added => { if (!added) alert('이미 목록에 있는 Riot ID입니다.'); }); },
    updateMember: member => { void model.updateMember(member); },
    removeMember: id => { void model.removeMember(id); },
    forgetMember: model.forgetMember,
  };
  return <LolContext.Provider value={state}>{children}</LolContext.Provider>;
}
