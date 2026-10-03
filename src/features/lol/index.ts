// 리그 오브 레전드 기능의 공개 인터페이스. 바깥(App 등)은 이 파일을 통해서만 가져다 쓴다.
import { createLolData } from './api/lolData';
import { createRiotClient, defaultRoute } from './api/riot';

export { Dashboard } from './components/Dashboard';
export { MasteryShowcase } from './components/MasteryShowcase';
export { Settings } from './components/Settings';
export { SquadManager } from './components/SquadManager';
export { SynergyAnalyzer } from './components/SynergyAnalyzer';
export { rosterApi, toMember } from './api/roster';
export { summarizeRoster } from './domain/summary';
export { INITIAL_MEMBERS } from './mockData';
export type { Member } from './types';
export type { Overview, Summoner } from './api/lolData';

// 배포에서는 서버 프록시, 로컬 개발에서는 vite 프록시(devApiKey 사용)로 연결된 LolData
export const createLol = (devApiKey: string) => createLolData(createRiotClient(defaultRoute(devApiKey)));
