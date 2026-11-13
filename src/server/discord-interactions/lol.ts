import { listRoster } from '../lol/roster';
import { RiotUnavailableError, summonerStats, type RankSummary, type SummonerStats } from '../lol/stats';
import { fit, label, ownedFresh, privateMessage, SITE, type ComponentInteraction, type Message } from './protocol';

// /전적: 닉네임#태그를 직접 넣거나, 비우면 사이트의 공용 소환사 목록에서 고른다(선택 메뉴 최대 25개).
// 티어 한글 이름은 화면 쪽(features/lol/domain/tiers.ts)과 같은 표다. 서버는 기능 코드를 가져올 수 없어 따로 둔다.
const TIERS: Record<string, string> = { CHALLENGER: '챌린저', GRANDMASTER: '그랜드마스터', MASTER: '마스터', DIAMOND: '다이아몬드',
  EMERALD: '에메랄드', PLATINUM: '플래티넘', GOLD: '골드', SILVER: '실버', BRONZE: '브론즈', IRON: '아이언' };

export async function lolCommand(owner: string, riotId: string | undefined, now = Date.now()): Promise<Message> {
  if (riotId) {
    const match = riotId.match(/^(.+?)\s*#\s*([^#]+)$/);
    if (!match) return privateMessage('닉네임은 `이름#태그` 형식으로 입력해 주세요. 비워 두면 등록된 소환사 목록에서 고를 수 있어요.');
    return lolStats(match[1].trim(), match[2].trim());
  }
  const roster = await listRoster();
  if (!roster.length) return privateMessage(`등록된 소환사가 없어요. 사이트에서 추가하거나 \`/전적 닉네임:이름#태그\`로 바로 찾아 주세요: ${SITE}/lol/squad`);
  return privateMessage(`전적을 볼 소환사를 골라 주세요.${roster.length > 25 ? ` 등록된 ${roster.length}명 중 최근 등록한 25명만 보여요. 다른 소환사는 닉네임으로 찾아 주세요.` : ''}`,
    [{ type: 1, components: [{ type: 3, custom_id: `lol:v1:${owner}:${Math.floor(now / 1000)}`, placeholder: '소환사 선택', min_values: 1, max_values: 1,
      options: roster.slice(0, 25).map(entry => ({ label: `${entry.gameName}#${entry.tagLine}`.slice(0, 100), value: entry.id })) }] }]);
}

export async function lolSelection(interaction: ComponentInteraction, now = Date.now()): Promise<Message> {
  const [, , owner, issuedAt] = interaction.data.custom_id.split(':');
  if (!ownedFresh(owner, issuedAt, interaction, now) || !('values' in interaction.data)) return privateMessage('선택창이 만료됐거나 다른 사람의 선택창이에요. /전적을 다시 실행해 주세요.');
  const id = interaction.data.values[0];
  const entry = (await listRoster()).find(item => item.id === id);
  if (!entry) return privateMessage('목록에서 삭제된 소환사예요. /전적을 다시 실행해 주세요.');
  return lolStats(entry.gameName, entry.tagLine);
}

const rankLine = (name: string, rank: RankSummary | null) => {
  if (!rank) return `${name}: 배치 전`;
  const games = rank.wins + rank.losses;
  const tier = `${TIERS[rank.tier] ?? rank.tier}${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) ? '' : ` ${rank.rank}`}`;
  return `${name}: **${tier}** ${rank.leaguePoints}LP · ${rank.wins}승 ${rank.losses}패${games ? ` (${Math.round(rank.wins / games * 100)}%)` : ''}`;
};

export function statsMessage(stats: SummonerStats): Message {
  const live = stats.inGame === null ? '실시간 게임 확인 실패' : stats.inGame ? '🔴 지금 게임 중' : '게임 중 아님';
  const recent = stats.recent.map(game => `${game.win ? '✅ 승' : '❌ 패'} ${label(game.champion, 30)} ${game.kills}/${game.deaths}/${game.assists}${game.mode ? ` · ${label(game.mode, 20)}` : ''}`);
  return privateMessage(fit([
    `🎮 **${label(`${stats.gameName}#${stats.tagLine}`)}**${stats.level ? ` · Lv. ${stats.level}` : ''} · ${live}`,
    rankLine('솔로랭크', stats.solo), rankLine('자유랭크', stats.flex),
    stats.failures.includes('matches') ? '최근 경기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
      : recent.length ? `최근 경기\n${recent.join('\n')}` : '최근 경기 기록이 없어요.',
    `숙련도·듀오 시너지는 사이트에서 볼 수 있어요: ${SITE}/lol`,
  ].join('\n')));
}

async function lolStats(gameName: string, tagLine: string): Promise<Message> {
  try {
    const stats = await summonerStats(gameName, tagLine);
    if (!stats) return privateMessage(`존재하지 않는 Riot ID예요. 닉네임(${label(gameName, 40)})과 태그(#${label(tagLine, 20)})를 확인해 주세요.`);
    return statsMessage(stats);
  } catch (error) {
    if (!(error instanceof RiotUnavailableError)) throw error;
    console.error('discord lol stats failed: riot status', error.status);
    return privateMessage(error.status === 429 ? 'Riot 호출 한도를 넘었어요. 1~2분 뒤 다시 시도해 주세요.'
      : error.status === 401 || error.status === 403 ? 'Riot API 키 문제로 조회하지 못했어요. 관리자에게 알려 주세요.'
        : 'Riot 서버에서 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}
