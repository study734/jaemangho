import { db } from '../db';
import { fit, label, mention, privateMessage, type Message } from './protocol';

// /모집: 채널에 공개로 올리는 "같이 할 사람 모집". 상태는 discord_lobbies 한 행이고, 버튼은 모집 id만 담는다.
// 참여·나가기·마감은 SQL 한 문장으로 조건을 확인하며 바꾼다(동시에 눌러도 정원 초과·중복 참여 없음).
// 메시지는 버튼을 누른 사람의 interaction 토큰으로 고치므로 봇 권한이 필요 없다.
export interface Lobby {
  id: string; ownerId: string; game: string | null; playTime: string | null; max: number | null;
  memberIds: string[]; closed: boolean; version: number;
}
export type LobbyAction = 'join' | 'leave' | 'close' | 'recommend';
export const LOBBY_TTL_HOURS = 24; // SQL의 interval '24 hours'와 같은 값

export async function createLobby(lobby: Pick<Lobby, 'id' | 'ownerId' | 'game' | 'playTime' | 'max'>): Promise<Lobby> {
  const sql = await db();
  await sql`delete from discord_lobbies where created_at < now() - interval '7 days'`;
  // 같은 /모집이 다시 와도(Discord 재전송) 같은 모집을 쓴다.
  await sql`insert into discord_lobbies (id, owner_discord_id, game, play_time, max_members, member_ids)
    values (${lobby.id}, ${lobby.ownerId}, ${lobby.game}, ${lobby.playTime}, ${lobby.max}, ${[lobby.ownerId]}) on conflict (id) do nothing`;
  return (await loadLobby(lobby.id))!;
}

// 만료(24시간)된 모집은 없는 것으로 본다.
export async function loadLobby(id: string): Promise<Lobby | null> {
  const sql = await db();
  const rows = await sql`select id, owner_discord_id as "ownerId", game, play_time as "playTime", max_members as max,
      member_ids as "memberIds", closed, version
    from discord_lobbies where id = ${id} and created_at > now() - interval '24 hours'`;
  return (rows[0] as unknown as Lobby | undefined) ?? null;
}

// 바뀌었으면 true. 바뀌지 않은 이유는 호출자가 loadLobby로 구분한다.
export async function changeLobby(id: string, userId: string, action: Exclude<LobbyAction, 'recommend'>): Promise<boolean> {
  const sql = await db();
  const rows = action === 'join'
    ? await sql`update discord_lobbies set member_ids = array_append(member_ids, ${userId}), version = version + 1
        where id = ${id} and not closed and created_at > now() - interval '24 hours' and not (${userId} = any(member_ids))
          and (max_members is null or cardinality(member_ids) < max_members) returning id`
    : action === 'leave'
      ? await sql`update discord_lobbies set member_ids = array_remove(member_ids, ${userId}), version = version + 1
          where id = ${id} and not closed and created_at > now() - interval '24 hours' and ${userId} = any(member_ids)
            and owner_discord_id <> ${userId} returning id`
      : await sql`update discord_lobbies set closed = true, version = version + 1
          where id = ${id} and not closed and created_at > now() - interval '24 hours' and owner_discord_id = ${userId} returning id`;
  return rows.length === 1;
}

const button = (label: string, style: number, custom_id: string, disabled = false) => ({ type: 2, style, label, custom_id, disabled });
export function lobbyMessage(lobby: Lobby): Message {
  const count = `${lobby.memberIds.length}${lobby.max ? `/${lobby.max}` : ''}명`;
  const full = !!lobby.max && lobby.memberIds.length >= lobby.max;
  const content = fit([
    `🎮 **같이 할 사람 모집**${lobby.closed ? ' (마감)' : full ? ' (모집 완료)' : ''} · ${mention(lobby.ownerId)}님`,
    [lobby.game && `게임: ${label(lobby.game, 100)}`, lobby.playTime && `시간: ${label(lobby.playTime, 60)}`, `인원: ${count}`].filter(Boolean).join(' · '),
    `참여: ${lobby.memberIds.map(mention).join(', ')}`,
    ...(lobby.closed ? [] : ['`게임추천`은 참여한 사람들의 Steam 계정으로 함께할 게임을 찾아 누른 사람에게만 보여줘요.']),
  ].join('\n'));
  if (lobby.closed) return privateMessage(content);
  return privateMessage(content, [{ type: 1, components: [
    button('참여', 3, `lobby:${lobby.id}:join`, full), button('나가기', 2, `lobby:${lobby.id}:leave`),
    button('🎲 게임추천', 1, `lobby:${lobby.id}:recommend`), button('마감', 4, `lobby:${lobby.id}:close`),
  ] }]);
}

// 바뀐 뒤 메시지를 고친다. 동시에 누른 다른 사람의 수정이 늦게 도착해 옛 상태로 덮어쓸 수 있으므로,
// 고친 뒤 버전이 바뀌었으면 최신 상태로 다시 고친다(최대 3번). 마지막으로 바꾼 사람의 수정이 항상 최신을 반영한다.
export async function renderLobby(id: string, edit: (message: Message) => Promise<unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const lobby = await loadLobby(id);
    if (!lobby) return;
    await edit(lobbyMessage(lobby));
    if ((await loadLobby(id))?.version === lobby.version) return;
  }
}

// 버튼을 누른 사람에게만 보이는 안내(null이면 메시지만 고친 것).
export async function lobbyAction(id: string, userId: string, action: Exclude<LobbyAction, 'recommend'>, edit: (message: Message) => Promise<unknown>): Promise<Message | null> {
  if (await changeLobby(id, userId, action)) { await renderLobby(id, edit); return null; }
  const lobby = await loadLobby(id);
  if (!lobby) return privateMessage(`${LOBBY_TTL_HOURS}시간이 지난 모집이에요. /모집으로 새로 모아 주세요.`);
  if (lobby.closed) return privateMessage('이미 마감된 모집이에요.');
  if (action === 'close') return privateMessage('모집을 연 사람만 마감할 수 있어요.');
  if (action === 'leave') return privateMessage(lobby.ownerId === userId ? '모집을 연 사람은 나갈 수 없어요. 그만두려면 마감을 눌러 주세요.' : '참여하지 않은 모집이에요.');
  return privateMessage(lobby.memberIds.includes(userId) ? '이미 참여했어요.' : '인원이 다 찼어요.');
}
