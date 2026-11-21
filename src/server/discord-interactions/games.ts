import { linkedPlayers } from './access';
import { loadParty, saveParty, setPartyPreference, type Party } from './party';
import { createLobby, lobbyMessage } from './lobby';
import { blocked, CONNECT_URL, fit, friendPicker, label, linkButton, mention, privateMessage, SITE, type Message, type PartyAction, type Preference, type Reply, type Scope } from './protocol';
import { recommendGames, type RecommendationsResult } from '../steam/recommendations';
import { acceptSteamConsent, hasSteamConsent, STEAM_FEATURE_NOTICE } from '../steam/consent';
import { STEAM_STORAGE_COUNTRY } from '../activity/steam-policy';
import { STEAM_NOTICE_COUNTRY_TERM, STEAM_NOTICE_INTRO, STEAM_NOTICE_ITEMS, STEAM_NOTICE_TITLE } from '../../lib/steam-notice';
import { lastParty } from './party';
import { nudgeButton } from './nudge';
import { runSteamCollection, SteamCollectionBusyError } from '../activity/steam-collection';
import { reportFailure } from '../diagnostics';
import { getDeals } from '../steam/deals';
import { compareGames } from '../steam/games';
import { findMissions } from '../steam/missions';

// 디스코드의 Steam 공통 게임: 친구 선택 -> 추천 -> 버튼(뽑기·세일·같이 도전·공통 게임).
// 계산은 웹과 같은 src/server/steam 서비스를 쓰고, 여기서는 디스코드 메시지로 바꾸기만 한다.
const scopeNames = { all: '모두 보유', any: '일부 보유 포함', unowned: '전원 미보유' };
export const preferenceNames = { balanced: '경험이 비슷한 게임', familiar: '익숙한 게임', fresh: '새로 해 볼 게임', recent: '요즘 크루픽 (최근 2주)' };
const store = (appId: number) => `https://store.steampowered.com/app/${appId}/`;
// 주소를 꺾쇠로 감싼 마크다운 링크는 디스코드의 큰 링크 미리보기를 끈다(게임마다 붙으면 목록을 읽기 어렵다).
const link = (text: string, url: string) => `[${text}](<${url}>)`;
const PAGE = 5;
const won = (value: number) => `₩${value.toLocaleString('ko-KR')}`;
const hours = (minutes: number) => minutes >= 60 ? `${Math.round(minutes / 60).toLocaleString('ko-KR')}시간` : `${minutes}분`;
const expired = privateMessage('버튼이 만료됐거나 다른 사람의 결과예요. /게임추천을 다시 실행해 주세요.');
const changed = privateMessage('선택한 Steam 계정이 변경됐어요. 사이트에서 연결 상태를 확인한 뒤 다시 시도해 주세요.');

// 웹의 Steam 화면과 같은 기준: 요청자 본인의 현재 Steam 기능 동의가 있어야 한다.
// 동의가 없으면 웹과 같은 고지(steam-notice.ts)와 동의 버튼을 보여 디스코드 안에서 끝낸다(intent/0005 R4).
export async function steamConsentMessage(userId: string): Promise<Message | null> {
  if (await hasSteamConsent(userId)) return null;
  const notice = [`### ${STEAM_NOTICE_TITLE}`, STEAM_NOTICE_INTRO, '',
    ...STEAM_NOTICE_ITEMS.map(item => `**${item.term}** — ${item.text}`),
    `**${STEAM_NOTICE_COUNTRY_TERM}** — ${STEAM_STORAGE_COUNTRY ?? '정해지지 않음'}`].join('\n');
  return blocked('steam_consent', privateMessage(fit(notice), [{ type: 1, components: [
    { type: 2, style: 1, label: '동의하고 게임추천 시작', custom_id: 'steamconsent:accept' },
    linkButton('Steam 데이터 안내 자세히 보기', `${SITE}/privacy/steam`),
  ] }]));
}

const CONSENT_PREPARE_MS = 10_000;
// 동의 버튼: 웹(POST /api/steam/consent)과 같은 기록을 남기고, 확인된 내 계정의 첫 기준 기록을 준비한 뒤 친구 선택창을 연다.
// 준비가 실패하거나 다른 수집이 돌고 있어도 선택창은 연다(다음 예약 수집이 이어 받는다). 저장 국가가 정해지지 않았으면 저장하지 않는다.
export async function acceptConsentAndPick(userId: string, owner: string, now = Date.now()): Promise<Message> {
  let steamIds: string[];
  try { steamIds = await acceptSteamConsent(userId, STEAM_FEATURE_NOTICE); }
  catch (error) {
    if (error instanceof Error && error.message === 'steam_notice_changed') {
      return privateMessage(`지금은 디스코드에서 동의를 받을 수 없어요. [사이트](<${SITE}/steam>)에서 확인해 주세요.`);
    }
    throw error;
  }
  if (steamIds.length) {
    // 디스코드 처리 예산(45초) 안에서 선택창을 보내도록 짧게 끊는다. 못 한 계정은 다음 예약 수집이 이어 받는다.
    try { await runSteamCollection('manual', { steamIds, budgetMs: CONSENT_PREPARE_MS }); }
    catch (error) { if (!(error instanceof SteamCollectionBusyError)) reportFailure('steam.consent.prepare', error); }
  }
  const picker = friendPicker(owner, 'all', 'balanced', now, await lastParty(owner));
  return { ...picker, content: `✅ 동의했어요. ${picker.content}` };
}

type Players = { ok: true; steamIds: string[]; discordIds: string[] } | { ok: false; message: Message };
async function resolvePlayers(discordIds: string[]): Promise<Players> {
  const players = await linkedPlayers(discordIds);
  const counts = discordIds.map(id => players.filter(player => player.discordId === id));
  const missing = discordIds.filter((_, index) => counts[index].length === 0);
  if (missing.length) return { ok: false, message: blocked('friend_unlinked', privateMessage(`Steam이 연결되지 않은 친구가 있어요: ${missing.map(mention).join(', ')}\n연결되지 않았거나 이용할 수 없는 계정은 추천에 포함할 수 없어요. 아래 버튼으로 친구들에게 알리거나 연결 화면을 공유해 주세요.`,
    [{ type: 1, components: [nudgeButton(missing), linkButton('Steam 연결 화면', CONNECT_URL)] }])) };
  const ambiguous = discordIds.filter((_, index) => counts[index].length !== 1);
  if (ambiguous.length) return { ok: false, message: privateMessage(`Steam 계정이 여러 개 연결돼 있어요: ${ambiguous.map(mention).join(', ')}\n사이트에서 사용할 Steam 계정의 주인 연결을 정리한 뒤 다시 시도해 주세요.`) };
  const steamIds = counts.map(rows => rows[0].steamId);
  if (new Set(steamIds).size !== steamIds.length) return { ok: false, message: privateMessage('서로 다른 친구에게 같은 Steam 계정이 연결돼 있어요. 사이트에서 계정 연결을 확인해 주세요.') };
  return { ok: true, steamIds, discordIds };
}

const toDiscord = (players: { steamIds: string[]; discordIds: string[] }) => (steamId: string) => mention(players.discordIds[players.steamIds.indexOf(steamId)]);
const unreadable = (ids: string[], who: (id: string) => string) =>
  privateMessage(`보유 목록을 확인할 수 없어 멈췄어요: ${ids.map(who).join(', ')}\nSteam 게임 세부 정보 공개 설정을 확인해 주세요.`);

const button = (label: string, custom_id: string) => ({ type: 2, style: 2, label, custom_id });
// 추천 결과 아래 버튼: 다른 추천(같은 메시지에서 다음 5개), 뽑기·세일·같이 도전·모두 가진 게임, 기준 바꾸기.
export function partyButtons(partyId: string, { total = 0, offset = 0, scope = 'all', preference = 'balanced', games = [] }: { total?: number; offset?: number; scope?: Scope; preference?: Preference; games?: string[] } = {}) {
  const next = offset + PAGE < total ? offset + PAGE : 0;
  return [
    { type: 1, components: [
      ...(total > PAGE ? [{ ...button('🔄 다른 추천', `party:${partyId}:more:${next}`), style: 1 }] : []),
      button('🎲 하나 뽑기', `party:${partyId}:pick`), button('🛒 세일', `party:${partyId}:deals`),
      button('🏆 같이 도전', `party:${partyId}:missions`), button('📚 모두 가진 게임', `party:${partyId}:common`),
    ] },
    // 전원 미보유는 Steam 인기·신규 순서라 기준이 없다.
    ...(scope === 'unowned' ? [] : [{ type: 1, components: [{ type: 3, custom_id: `party:${partyId}:pref`, placeholder: '추천 기준 바꾸기',
      options: (Object.keys(preferenceNames) as Preference[]).map(value => ({ label: preferenceNames[value], value, default: value === preference })) }] }]),
    // 보고 있는 추천 중 하나로 바로 /모집을 연다(채널에 공개, 정원은 고른 친구 수).
    ...(games.length ? [{ type: 1, components: [{ type: 3, custom_id: `party:${partyId}:recruit`, placeholder: '📣 이 게임으로 모집하기',
      options: games.map(name => ({ label: name.slice(0, 100), value: name.slice(0, 100) })) }] }] : []),
  ];
}

export function recommendationMessage(result: RecommendationsResult, ids: string[], discordIds: string[], scope: Scope, preference: Preference = 'balanced', offset = 0): Message {
  const who = toDiscord({ steamIds: ids, discordIds });
  if (result.excluded.length) return unreadable(result.excluded, who);
  const criteria = scope === 'unowned' ? 'Steam 인기·신규 후보' : preferenceNames[preference];
  if (!result.games.length) return privateMessage(`추천 범위: ${scopeNames[scope]} · 기준: ${criteria}\n확인한 후보에서 함께할 게임을 찾지 못했어요.${result.unverified ? '\n스토어 지원 정보를 확인하지 못한 후보도 있어요. 잠시 후 다시 시도해 주세요.' : ''}${scope === 'unowned' ? '' : '\n아래에서 기준을 바꿔 보세요.'}`);
  const start = offset < result.games.length ? offset : 0;
  const page = result.games.slice(start, start + PAGE);
  const lines = page.flatMap((game, index) => {
    const missing = scope === 'any' && game.missingIds.length ? ` · 없음: ${game.missingIds.map(who).join(', ')}` : '';
    return [`**${start + index + 1}. ${link(label(game.name), store(game.appId))}** · ${game.support === 'coop' ? '협동' : '멀티플레이'}`,
      `-# ${game.reasons.slice(0, 2).map(reason => label(reason)).join(' · ')}${missing}`];
  });
  const range = result.games.length > PAGE ? ` · ${start + 1}~${start + page.length} / ${result.games.length}` : '';
  return privateMessage(fit([
    `### 🎮 게임 추천 · ${scopeNames[scope]} · ${criteria}`,
    `-# ${discordIds.map(mention).join(', ')}${range}`,
    ...lines,
    `-# 상위 후보 ${result.checked}개를 확인했어요. 최대 인원은 스토어에서 확인해 주세요.${scope === 'unowned' ? ' 보유 목록에 없다는 뜻이며 무료 게임은 구매 없이 할 수 있어요.' : ''}`,
  ].join('\n')));
}

// 친구를 고르면 파티를 저장하고 추천한다. 결과 아래 버튼은 같은 파티로 다시 고르지 않고 이어서 쓴다.
export async function gameRecommendations(party: Party, offset = 0): Promise<Message> {
  const players = await resolvePlayers(party.discordIds);
  if (!players.ok) return players.message;
  await saveParty(party);
  const result = await recommendGames(players.steamIds, party.preference, party.scope);
  if ('unknownIds' in result) return changed;
  const message = recommendationMessage(result, players.steamIds, party.discordIds, party.scope, party.preference, offset);
  if (result.excluded.length) return message;
  const start = offset < result.games.length ? offset : 0;
  // 같은 이름의 게임이 겹치면 선택 메뉴가 거부되므로 한 번씩만 넣는다.
  const shown = [...new Set(result.games.slice(start, start + PAGE).map(game => game.name.replace(/[\r\n]/g, ' ').trim().slice(0, 100)).filter(Boolean))];
  return { ...message, components: partyButtons(party.id, { total: result.games.length, offset: start, scope: party.scope, preference: party.preference, games: shown }) };
}

// more·pref는 보고 있던 추천 메시지를 그 자리에서 고친다({ edit }). 나머지는 새 비공개 메시지로 답한다.
export async function partyAction(partyId: string, ownerId: string, action: PartyAction, arg?: string, newId?: string): Promise<Reply> {
  const party = await loadParty(partyId, ownerId);
  if (!party) return expired;
  if (action === 'again') {
    const [scope, preference] = (arg ?? '').split(':') as [Scope, Preference];
    return gameRecommendations({ ...party, id: newId!, scope, preference });
  }
  if (action === 'recruit') {
    const lobby = await createLobby({ id: newId!, ownerId, game: arg!, playTime: null, max: party.discordIds.length });
    return { public: lobbyMessage(lobby) };
  }
  if (action === 'more') return { edit: await gameRecommendations(party, Number(arg)) };
  if (action === 'pref') {
    await setPartyPreference(party.id, ownerId, arg as Preference);
    return { edit: await gameRecommendations({ ...party, preference: arg as Preference }) };
  }
  const players = await resolvePlayers(party.discordIds);
  if (!players.ok) return players.message;
  const who = toDiscord(players);
  switch (action) {
    case 'pick': return pick(party, players.steamIds, arg ? Number(arg) : undefined);
    case 'deals': return deals(players.steamIds, who);
    case 'common': return common(players.steamIds, who);
    case 'missions': return missionPicker(party.id, players.steamIds, who);
    case 'mission': return missions(players.steamIds, Number(arg), who);
  }
}

// 웹의 '오늘의 게임 뽑기'와 같다: 추천 결과에서 균등하게 고르고, 후보가 둘 이상이면 직전 게임은 뺀다.
async function pick(party: Party, ids: string[], previous: number | undefined, random = Math.random): Promise<Message> {
  const result = await recommendGames(ids, party.preference, party.scope);
  if ('unknownIds' in result) return changed;
  if (result.excluded.length || !result.games.length) return recommendationMessage(result, ids, party.discordIds, party.scope, party.preference);
  const pool = result.games.length > 1 ? result.games.filter(game => game.appId !== previous) : result.games;
  const game = pool[Math.floor(random() * pool.length)];
  return privateMessage(`🎲 오늘은 이 게임 어때요?\n\n**${link(label(game.name), store(game.appId))}** — ${game.support === 'coop' ? '협동 지원' : '멀티플레이 지원'}\n${game.reasons.slice(0, 2).map(reason => label(reason)).join(' · ')}\n\n추천 결과 ${result.games.length}개 중에서 골랐어요.`,
    [{ type: 1, components: [button('🎲 다시 뽑기', `party:${party.id}:pick:${game.appId}`)] }]);
}

async function deals(ids: string[], who: (id: string) => string): Promise<Message> {
  const result = await getDeals(ids);
  if ('unknownIds' in result) return changed;
  if (result.excluded.length) return unreadable(result.excluded, who);
  const notes = [
    ...(result.alreadyOwned ? [`모두 이미 가진 확인된 협동 게임 ${result.alreadyOwned}개는 뺐어요.`] : []),
    ...(result.pricesUnavailable ? ['스토어 가격을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'] : []),
  ];
  if (!result.deals.length) return privateMessage(['선택한 인원에 맞고 아직 없는 사람이 있는 확인된 협동 게임이 없어요.', ...notes].join('\n'));
  const lines = result.deals.slice(0, 8).map((deal, index) => {
    const price = deal.price === null ? '가격 정보 없음(무료·미출시 등)'
      : deal.price.discountPercent > 0 ? `**-${deal.price.discountPercent}%** ${won(deal.price.final)} (정가 ${won(deal.price.initial)})` : won(deal.price.final);
    return `${index + 1}. ${link(label(deal.name), store(deal.appId))} — ${price}\n   없는 사람: ${deal.missingIds.map(who).join(', ')}`;
  });
  return privateMessage(fit(['🛒 같이 사면 좋은 협동 게임 (세일 순, 한국 스토어)', ...lines, ...notes].join('\n\n')));
}

async function commonList(ids: string[], who: (id: string) => string) {
  const result = await compareGames(ids, 'common');
  if ('unknownIds' in result) return changed;
  if (result.excluded.length) return unreadable(result.excluded, who);
  return [...result.games].sort((a, b) => b.totalMinutes - a.totalMinutes || a.appId - b.appId);
}

async function common(ids: string[], who: (id: string) => string): Promise<Message> {
  const games = await commonList(ids, who);
  if (!Array.isArray(games)) return games;
  if (!games.length) return privateMessage('선택한 모두가 가진 게임이 없어요.');
  const lines = games.slice(0, 10).map((game, index) => `${index + 1}. ${link(label(game.name), store(game.appId))} — 함께 ${hours(game.totalMinutes)}`);
  return privateMessage(fit([`📚 모두 가진 게임 ${games.length.toLocaleString('ko-KR')}개 (함께 플레이한 시간 순)`, ...lines,
    ...(games.length > 10 ? ['전체 목록과 검색은 사이트에서 볼 수 있어요.'] : [])].join('\n')));
}

// 같이 도전: 모두 가진 게임 중 하나를 고르면 공개 과제 진행도를 비교한다(디스코드 선택 메뉴는 최대 25개).
async function missionPicker(partyId: string, ids: string[], who: (id: string) => string): Promise<Message> {
  const games = await commonList(ids, who);
  if (!Array.isArray(games)) return games;
  if (!games.length) return privateMessage('선택한 모두가 가진 게임이 없어 같이 도전할 게임을 고를 수 없어요.');
  return privateMessage(`🏆 같이 도전할 게임을 골라 주세요. 모두 가진 게임 ${games.length}개 중 함께 오래 한 순서로 최대 25개를 보여줘요.`, [{ type: 1, components: [{
    type: 3, custom_id: `party:${partyId}:mission`, placeholder: '같이 도전할 게임', min_values: 1, max_values: 1,
    options: games.slice(0, 25).map(game => ({ label: game.name.replace(/[\r\n]/g, ' ').slice(0, 100), value: String(game.appId), description: `함께 ${hours(game.totalMinutes)}` })),
  }] }]);
}

async function missions(ids: string[], appId: number, who: (id: string) => string): Promise<Message> {
  const result = await findMissions(ids, appId);
  if ('unknownIds' in result) return changed;
  const storeLink = link('스토어', store(appId));
  if (result.state === 'unavailable') return privateMessage(`진행도를 확인할 수 없어요: ${result.unavailableIds.map(who).join(', ') || '일부 과제'}\nSteam 게임 세부 정보 공개 설정을 확인해 주세요. ${storeLink}`);
  if (result.state === 'not-owned') return privateMessage(`지금은 모두 가진 게임이 아니에요. 없는 사람: ${result.missingIds.map(who).join(', ')}`);
  if (result.state === 'unsupported') return privateMessage(`공개된 도전 과제가 없는 게임이에요. ${storeLink}`);
  if (result.state === 'complete') return privateMessage(`확인된 공개 과제를 모두 함께 달성했어요! ${storeLink}`);
  const lines = result.missions.slice(0, 5).map(mission => {
    const kind = mission.kind === 'team-first' ? '팀 첫 도전' : `따라잡기 · 아직: ${mission.lockedIds.map(who).join(', ')}`;
    return `• **${label(mission.title, 100)}** — ${kind}${mission.description ? `\n   ${label(mission.description, 150)}` : ''}`;
  });
  return privateMessage(fit([`🏆 같이 도전 ${storeLink} · 공개 과제 ${result.totalPublic}개 · 모두 달성 ${result.completedTogether}개 · 진행도 미확인 ${result.unknownAchievements}개`, ...lines].join('\n\n')));
}
