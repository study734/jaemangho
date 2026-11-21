import { db } from '../db';
import { CONNECT_URL, linkButton, mention, privateMessage, type Reply } from './protocol';

// 연결 안 된 친구 알림(intent/0005 R5). 게임추천에서 Steam이 연결되지 않은 친구가 있으면 요청자에게 이 버튼을 보이고,
// 요청자가 누르면 그 친구들만 멘션 알림을 받는 공개 메시지를 올린다. 같은 친구에게는 6시간에 한 번만 알린다(연타·반복 방지).
const CUSTOM_ID_LIMIT = 100;
const MAX_FRIENDS = 5;

// custom_id는 100자라 친구 ID를 '.'로 이어 들어가는 만큼(최대 5명)만 담는다.
export function nudgeButton(ids: string[]) {
  let customId = 'nudge:';
  for (const id of ids.slice(0, MAX_FRIENDS)) {
    const next = customId === 'nudge:' ? `${customId}${id}` : `${customId}.${id}`;
    if (next.length > CUSTOM_ID_LIMIT) break;
    customId = next;
  }
  return { type: 2, style: 1, label: '📣 연결 안 된 친구에게 알리기', custom_id: customId };
}

// 6시간 안에 알림을 받지 않은 친구만 골라 알린 것으로 기록한다(한 문장이라 동시에 눌러도 한 번). 하루 지난 기록은 지운다.
export async function claimNudges(ids: string[]): Promise<string[]> {
  const sql = await db();
  await sql`delete from discord_nudges where nudged_at < now() - interval '1 day'`;
  const rows = await sql`insert into discord_nudges (discord_id) select unnest(${ids}::text[])
    on conflict (discord_id) do update set nudged_at = now() where discord_nudges.nudged_at < now() - interval '6 hours'
    returning discord_id as "discordId"`;
  return rows.map(row => row.discordId as string);
}

// 알릴 친구(claimNudges 결과)로 응답을 만든다(DB 없음). 남은 친구가 없으면 요청자에게만 알린다.
export function nudgeReply(requester: string, targets: string[]): Reply {
  if (!targets.length) return privateMessage('이 친구들에게는 최근 6시간 안에 이미 알렸어요. 연결을 마치면 다시 /게임추천을 실행해 주세요.');
  return { public: {
    content: `🎮 ${mention(requester)}님이 같이 게임추천을 받으려고 해요.\n${targets.map(mention).join(' ')} 처음 한 번만 Steam을 연결해 주세요. 디스코드 로그인 한 번이면 돼요.`,
    allowed_mentions: { parse: [], users: targets },
    components: [{ type: 1, components: [linkButton('Steam 연결하기', CONNECT_URL)] }],
  } };
}
