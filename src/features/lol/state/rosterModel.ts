import type { Details, LolData, Overview, Summoner } from '../api/lolData';
import { rosterFailureMessage, toMember, type rosterApi } from '../api/roster';
import type { Member } from '../types';

export interface RosterSnapshot {
  members: Member[];
  isLoading: boolean;
  error: string | null;
}

const sameAccount = (a: Member, b: Member) => a.gameName === b.gameName && a.tagLine === b.tagLine;
const detailLabels = { mastery: '숙련도', matches: '최근 전적', activeGame: '실시간 게임' };

function withDetails(member: Member, details: Details): Member {
  return {
    ...member,
    detailsError: details.failures.length
      ? `${details.failures.map(part => detailLabels[part]).join(', ')} 조회에 실패했습니다. 잠시 후 상세 화면을 다시 열어 주세요.` : undefined,
    matchesUnavailable: details.failures.includes('matches'),
    championMasteries: details.failures.includes('mastery') ? member.championMasteries : details.championMasteries,
    matches: details.failures.includes('matches') && !details.matches.length ? member.matches : details.matches,
    activeGame: details.failures.includes('activeGame') ? member.activeGame : details.activeGame,
  };
}

// React and timers are not part of this module. Callers and tests use the same
// actions; each completed request updates only the account it actually read.
export function createRosterModel({ roster, lol, newId = () => Math.random().toString(36).slice(2, 9) }: {
  roster: typeof rosterApi; lol: LolData; newId?: () => string;
}) {
  const initialSnapshot: RosterSnapshot = { members: [], isLoading: true, error: null };
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const update = (change: Partial<RosterSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach(listener => listener());
  };
  let ready = false;
  let initialLoad: Promise<void> | null = null;
  let refreshing = 0;
  let revision = 0;
  const overviewRequests = new Map<string, symbol>();
  const detailRequests = new Map<string, symbol>();

  async function refresh(targets: Member[]) {
    refreshing++;
    update({ isLoading: true });
    const results = await Promise.all(targets.map(async target => {
      const token = Symbol();
      overviewRequests.set(target.id, token);
      try { return { target, token, overview: await lol.overview(target) }; }
      catch (error) { return { target, token, overview: null, failure: error instanceof Error ? error.message : '조회 실패' }; }
    }));
    const current = results.filter(result => overviewRequests.get(result.target.id) === result.token
      && snapshot.members.some(member => member.id === result.target.id && sameAccount(member, result.target)));
    const overviews = new Map<string, Overview>(current.flatMap(result => result.overview ? [[result.target.id, result.overview]] : []));
    const failed = current.filter(result => !result.overview).map(result => `${result.target.gameName}: ${result.failure}`);
    refreshing--;
    update({
      members: snapshot.members.map(member => ({ ...member, ...overviews.get(member.id) })),
      isLoading: refreshing > 0,
      error: snapshot.error ?? (failed.length ? `${failed.join(', ')}의 최신 정보를 불러오지 못했습니다. 기존 정보를 표시합니다. 잠시 후 새로고침해 주세요.` : null),
    });
  }

  function load() {
    if (initialLoad) return initialLoad;
    if (ready) return Promise.resolve();
    update({ isLoading: true, error: null });
    initialLoad = (async () => {
      try {
        const list = await roster.list();
        update({ members: list.map(toMember) });
        ready = true;
        await refresh(snapshot.members);
      } catch (error) {
        update({ isLoading: false, error: `소환사 목록을 불러오지 못했습니다. ${rosterFailureMessage(error)}` });
      }
    })().finally(() => { initialLoad = null; });
    return initialLoad;
  }

  async function persist(work: Promise<unknown>, startedRevision: number) {
    try { await work; return true; }
    catch (error) {
      const reason = rosterFailureMessage(error);
      update({ error: `저장하지 못했습니다. ${reason} 목록을 서버 기준으로 다시 불러옵니다.` });
      try {
        const list = await roster.list();
        // A recovery read must not erase edits that started after this write.
        if (revision === startedRevision) update({ members: list.map(entry => ({
          ...(snapshot.members.find(member => member.id === entry.id) ?? toMember(entry)), ...entry,
        })) });
        else update({ error: `저장 실패: ${reason} 이후 변경은 유지했습니다. 새로고침으로 서버 목록을 확인해 주세요.` });
      } catch (reloadError) {
        update({ error: `저장 실패: ${reason} 목록 재조회도 실패했습니다. ${rosterFailureMessage(reloadError)}` });
      }
      return false;
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    dismissError: () => update({ error: null }),
    async refreshAll() {
      if (!ready) return load();
      update({ error: null });
      return refresh(snapshot.members);
    },
    async loadDetails(target: Member) {
      const token = Symbol();
      detailRequests.set(target.id, token);
      let apply: (member: Member) => Member;
      try {
        const details = await lol.details(target);
        if (!details) throw new Error('Riot 계정을 찾지 못했습니다. 소환사명과 태그를 확인해 주세요.');
        apply = member => withDetails(member, details);
      } catch (error) {
        apply = member => ({ ...member, matchesUnavailable: true,
          detailsError: error instanceof Error ? error.message : '상세 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
      }
      if (detailRequests.get(target.id) !== token) return;
      update({ members: snapshot.members.map(member => member.id === target.id && sameAccount(member, target) ? apply(member) : member) });
    },
    searchSummoner(gameName: string, tagLine: string) {
      const name = gameName.trim();
      const tag = tagLine.trim().replace(/^#/, '').toUpperCase();
      if (!name || !tag) return Promise.reject(new Error('소환사명과 태그라인을 둘 다 입력해 주세요.'));
      return lol.lookup(name, tag);
    },
    async addMember(data: Summoner) {
      if (snapshot.members.some(member => member.gameName.toLowerCase() === data.gameName.toLowerCase()
        && member.tagLine.toLowerCase() === data.tagLine.toLowerCase())) return false;
      const member = { ...toMember({ id: newId(), gameName: data.gameName, tagLine: data.tagLine }), ...data };
      const startedRevision = ++revision;
      update({ members: [member, ...snapshot.members] });
      if (await persist(roster.add({ id: member.id, gameName: member.gameName, tagLine: member.tagLine }), startedRevision)) await refresh([member]);
      return true;
    },
    async updateMember(member: Member) {
      const startedRevision = ++revision;
      update({ members: snapshot.members.map(current => current.id === member.id ? member : current) });
      await persist(roster.update({ id: member.id, gameName: member.gameName, tagLine: member.tagLine }), startedRevision);
    },
    async removeMember(id: string) {
      const startedRevision = ++revision;
      update({ members: snapshot.members.filter(member => member.id !== id) });
      await persist(roster.remove(id), startedRevision);
    },
    forgetMember(id: string) {
      revision++;
      update({ members: snapshot.members.filter(member => member.id !== id) });
    },
  };
}
