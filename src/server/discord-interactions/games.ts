import { linkedPlayers } from './access';
import { privateMessage, type Message } from './protocol';
import { recommendGames, type RecommendationsResult } from '../steam/recommendations';
import type { OwnershipScope } from '../steam/recommend';

const scopeNames = { all: '모두 보유', any: '일부 보유 포함', unowned: '전원 미보유' };
const label = (name: string) => name.replace(/[\r\n]/g, ' ').slice(0, 80).replace(/[\\`*_~|[\]<>]/g, '\\$&');

export function recommendationMessage(result: RecommendationsResult, ids: string[], discordIds: string[], scope: OwnershipScope): Message {
  const mention = (steamId: string) => `<@${discordIds[ids.indexOf(steamId)]}>`;
  if (result.excluded.length) return privateMessage(`보유 목록을 확인할 수 없어 추천을 멈췄어요: ${result.excluded.map(mention).join(', ')}\nSteam 게임 세부 정보 공개 설정을 확인해 주세요.`);
  if (!result.games.length) return privateMessage(`추천 범위: ${scopeNames[scope]}\n확인한 후보에서 함께할 게임을 찾지 못했어요.${result.unverified ? '\n스토어 지원 정보를 확인하지 못한 후보도 있어요. 잠시 후 다시 시도해 주세요.' : ''}`);
  const lines = result.games.slice(0, 5).map((game, index) => {
    const missing = scope === 'any' && game.missingIds.length ? `\n   보유 목록에 없음: ${game.missingIds.map(mention).join(', ')}` : '';
    return `${index + 1}. [${label(game.name)}](https://store.steampowered.com/app/${game.appId}/) — ${game.support === 'coop' ? '협동 지원' : '멀티플레이 지원'}\n   ${game.reasons.slice(0, 2).map(label).join(' · ')}${missing}`;
  });
  const content = [`${discordIds.map(id => `<@${id}>`).join(', ')}의 게임 추천 · ${scopeNames[scope]}`, ...lines,
    `상위 후보 ${result.checked}개를 확인한 결과예요. 최대 인원은 스토어에서 확인해 주세요.`,
    ...(scope === 'unowned' ? ['Steam 인기·신규 목록 기준이며, 보유 목록에 없다는 뜻이에요. 무료 게임은 구매 없이 할 수 있어요.'] : []),
  ].join('\n\n');
  return privateMessage(content.length <= 2000 ? content : `${content.slice(0, 1930)}\n\n표시가 길어 일부 내용을 줄였어요.`);
}

export async function gameRecommendations(discordIds: string[], scope: OwnershipScope): Promise<Message> {
  const players = await linkedPlayers(discordIds);
  const counts = discordIds.map(id => players.filter(player => player.discordId === id));
  const missing = discordIds.filter((_, index) => counts[index].length === 0);
  if (missing.length) return privateMessage(`프로젝트 가입과 Steam 계정 연결을 확인해 주세요: ${missing.map(id => `<@${id}>`).join(', ')}\n연결되지 않았거나 이용할 수 없는 계정은 추천에 포함할 수 없어요.`);
  const ambiguous = discordIds.filter((_, index) => counts[index].length !== 1);
  if (ambiguous.length) return privateMessage(`Steam 계정이 여러 개 연결돼 있어요: ${ambiguous.map(id => `<@${id}>`).join(', ')}\n사이트에서 사용할 Steam 계정의 주인 연결을 정리한 뒤 다시 시도해 주세요.`);
  const ids = counts.map(rows => rows[0].steamId);
  if (new Set(ids).size !== ids.length) return privateMessage('서로 다른 친구에게 같은 Steam 계정이 연결돼 있어요. 사이트에서 계정 연결을 확인해 주세요.');
  const result = await recommendGames(ids, 'balanced', scope);
  if ('unknownIds' in result) return privateMessage('선택한 Steam 계정이 변경됐어요. 사이트에서 연결 상태를 확인한 뒤 다시 시도해 주세요.');
  return recommendationMessage(result, ids, discordIds, scope);
}
