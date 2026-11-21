import { adminUser, commandAccess } from './access';
import { ADMIN_DENIED, adminTask, type AdminTask } from './admin';
import { gameRecommendations, partyAction, steamConsentMessage } from './games';
import { createLobby, lobbyAction, lobbyMessage, loadLobby, type LobbyAction } from './lobby';
import { lolCommand, lolSelection } from './lol';
import { memberProfile, records } from './records';
import { discordPatchNotesText } from '../../lib/patch-notes';
import { findSource } from './source';
import { ACK_BODY, ackFor, friendPicker, SITE, interactionSchema, modalText, privateMessage, selection, verifyInteraction, type CommandInteraction, type ComponentInteraction, type Interaction, type Message, type ModalInteraction, type PartyAction, type Reply } from './protocol';
import { lastParty } from './party';
import { feedbackModal, saveFeedback } from './feedback';
import { actionName, recordUsage } from './usage';
import { reportFailure } from '../diagnostics';


const WORK_BUDGET_MS = 45_000;
const API = 'https://discord.com/api/v10';

async function readPayload(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65_536) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

type Sleep = (ms: number) => Promise<void>;
const wait: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 지연 응답 수정(PATCH @original), 본인에게만 보이는 후속 메시지(POST), 공개 지연 응답 삭제(DELETE @original).
export const editReply = (applicationId: string, token: string, message: Message, fetchFn: typeof fetch = fetch, sleep: Sleep = wait) =>
  deliver(`${API}/webhooks/${applicationId}/${token}/messages/@original`, 'PATCH', message, fetchFn, sleep);
export const followUp = (applicationId: string, token: string, message: Message, fetchFn: typeof fetch = fetch, sleep: Sleep = wait) =>
  deliver(`${API}/webhooks/${applicationId}/${token}`, 'POST', { ...message, flags: 64 }, fetchFn, sleep);
export const deleteReply = (applicationId: string, token: string, fetchFn: typeof fetch = fetch, sleep: Sleep = wait) =>
  deliver(`${API}/webhooks/${applicationId}/${token}/messages/@original`, 'DELETE', undefined, fetchFn, sleep);

// Only an error code/status is logged: interaction tokens and webhook URLs must never reach logs.
async function deliver(url: string, method: 'PATCH' | 'POST' | 'DELETE', message: object | undefined, fetchFn: typeof fetch, sleep: Sleep) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        method, ...(message ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) } : {}),
        signal: AbortSignal.timeout(3000), cache: 'no-store',
      });
    } catch {
      if (attempt < 2) { await sleep(250); continue; }
      console.error('discord interaction reply failed: network'); return false;
    }
    if (response.ok) return true;
    const body = await response.json().catch(() => null) as { retry_after?: number; code?: number } | null;
    const code = typeof body?.code === 'number' && Number.isSafeInteger(body.code) ? body.code : undefined;
    // The acknowledgement may still be reaching Discord when after() starts the PATCH.
    // Bound retries for unknown original messages/webhooks; persistent invalid tokens still fail.
    if (attempt < 2 && response.status === 404 && (code === 10008 || code === 10015)) {
      await sleep(attempt === 0 ? 250 : 500); continue;
    }
    if (attempt < 2 && response.status === 429) {
      const delay = body?.retry_after;
      if (typeof delay === 'number' && Number.isFinite(delay) && delay >= 0 && delay <= 1) {
        await sleep(Math.ceil(delay * 1000) + 50); continue;
      }
    }
    if (attempt < 2 && response.status >= 500) { await sleep(250); continue; }
    console.error('discord interaction reply failed:', response.status, 'code:', code ?? 'unknown'); return false;
  }
  return false;
}

const option = <T>(options: { name: string; value?: unknown }[] | undefined, name: string) =>
  options?.find(item => item.name === name)?.value as T | undefined;

async function runCommand(interaction: CommandInteraction, userId: string | null): Promise<Reply> {
  const { data } = interaction;
  const owner = interaction.member.user.id;
  if (data.name === '개선' || data.name === '운영') {
    const actor = await adminUser(owner, interaction.member.permissions);
    if (!actor) return ADMIN_DENIED;
    const sub = data.name === '운영' ? data.options[0] : undefined;
    const task: AdminTask = !sub ? '개선' : sub.name === '캐시' ? sub.options[0].value : sub.name;
    return adminTask(task, actor, sub?.name === '시상식채널' || sub?.name === '사용역할' ? sub.options?.[0]?.value : undefined);
  }
  if (data.name === '모집') {
    const lobby = await createLobby({ id: interaction.id, ownerId: owner, game: option<string>(data.options, '게임') ?? null,
      playTime: option<string>(data.options, '시간') ?? null, max: option<number>(data.options, '인원') ?? null });
    return { public: lobbyMessage(lobby) };
  }
  switch (data.name) {
    case '패치노트': return privateMessage(discordPatchNotesText());
    case '출처 찾기': return findSource(data);
    case '기록': return records();
    case '멤버': return memberProfile(option<string>(data.options, '대상') ?? owner);
    case '전적': return lolCommand(owner, option<string>(data.options, '닉네임'), Date.now(), userId ?? undefined);
    case '게임추천': if (!userId) return STEAM_LOGIN_REQUIRED;
      return await steamConsentMessage(userId)
      ?? friendPicker(owner, option(data.options, '범위') ?? 'all', option(data.options, '기준') ?? 'balanced', Date.now(), await lastParty(owner));
    // 의견 명령은 receiveInteraction이 첫 응답으로 입력창을 보내 여기까지 오지 않는다.
    case '의견': case '재순이에게 전달': return null;
  }
}

// 멤버 의견 제출(intent/0002). 원문은 저장만 하고 로그·오류 기록에는 남기지 않는다.
async function runFeedback(interaction: ModalInteraction, userId: string | null): Promise<Reply> {
  const [, kind, channelId, messageId] = interaction.data.custom_id.split(':');
  const result = await saveFeedback({ id: interaction.id, userId, discordId: interaction.member.user.id, body: modalText(interaction),
    source: kind === 'msg' ? 'message' : 'command',
    messageLink: kind === 'msg' ? `https://discord.com/channels/${interaction.guild_id}/${channelId}/${messageId}` : null });
  return privateMessage(result === 'saved'
    ? '💌 재순이가 전달받았어요. 운영진이 /개선에서 확인하고, 반영되면 /패치노트에 올라와요.'
    : '오늘은 의견을 많이 보내 주셨어요. 잠시 뒤에 다시 보내 주세요(24시간에 5건까지).');
}

// 쓴 글을 돌려줄 때 줄마다 '> '를 붙이면 줄이 많은 1000자 의견이 2000자를 넘으므로, 끝까지 인용하는 '>>> '를 한 번만 쓴다.
const quoteRest = (text: string) => `>>> ${text}`;

async function runComponent(interaction: ComponentInteraction, userId: string | null): Promise<Reply> {
  const owner = interaction.member.user.id;
  const [prefix, partyId, action, arg] = interaction.data.custom_id.split(':');
  if (prefix === 'lol') return lolSelection(interaction);
  if (prefix === 'lobby' && action !== 'recommend') {
    return lobbyAction(partyId, owner, action as Exclude<LobbyAction, 'recommend'>,
      message => editReply(interaction.application_id, interaction.token, message));
  }
  // 여기부터는 Steam 게임추천이다. 본인 Steam 연결·이용 동의는 사이트에서만 할 수 있다.
  if (!userId) return STEAM_LOGIN_REQUIRED;
  const denied = await steamConsentMessage(userId);
  if (denied) return denied;
  if (prefix === 'lobby') {
    // 모집에서 바로 게임추천: 참여한 사람들이 곧 함께할 친구다(다시 고르지 않음).
    const lobby = await loadLobby(partyId);
    if (!lobby) return privateMessage('24시간이 지난 모집이에요. /모집으로 새로 모아 주세요.');
    if (!lobby.memberIds.includes(owner)) return privateMessage('모집에 참여한 사람만 게임추천을 받을 수 있어요.');
    if (lobby.memberIds.length < 2) return privateMessage('2명 이상 모이면 게임추천을 받을 수 있어요.');
    return gameRecommendations({ id: interaction.id, ownerId: owner, discordIds: lobby.memberIds, scope: 'all', preference: 'balanced' });
  }
  if (prefix === 'party') {
    // again:<범위>:<기준>은 두 조각이고, 선택 메뉴(mission·pref)는 고른 값이 인자다.
    const value = 'values' in interaction.data ? interaction.data.values[0] : action === 'again' ? interaction.data.custom_id.split(':').slice(3).join(':') : arg;
    return partyAction(partyId, owner, action as PartyAction, value, interaction.id);
  }
  const chosen = selection(interaction);
  if (!chosen) return privateMessage('선택창이 만료됐거나 다른 사람의 선택창이에요. /게임추천을 다시 실행해 주세요.');
  return gameRecommendations({ id: interaction.id, ownerId: owner, discordIds: chosen.ids, scope: chosen.scope, preference: chosen.preference });
}

// 사이트 계정이 없어도 대부분의 기능을 쓴다(intent/0004). 본인 Steam이 필요한 게임추천만 사이트 로그인을 안내한다.
const BANNED = privateMessage('차단된 계정은 재순이를 이용할 수 없어요.');
// 역할 멘션은 이름으로 보이고 알림은 가지 않는다(privateMessage의 allowed_mentions).
const roleRequired = (roleId: string) => `<@&${roleId}> 역할이 있는 멤버만 재순이를 쓸 수 있어요. 서버 관리자에게 역할을 요청해 주세요.`;
const STEAM_LOGIN_REQUIRED = privateMessage(`게임추천은 내 Steam 계정이 필요해요. [재망호 사이트](<${SITE}/steam>)에 디스코드로 로그인해 Steam을 연결해 주세요. 다른 기능은 로그인 없이 쓸 수 있어요.`);

// 의견 제출: 입력창은 요청자 확인 전에 열리므로, 저장하지 못하면(차단·오류) 쓴 글을 돌려줘 다시 붙여 넣을 수 있게 한다.
// 요청자 확인을 포함한 모든 실패는 api/discord.feedback으로 남고, 원문은 기록하지 않는다.
async function processFeedback(interaction: ModalInteraction): Promise<Reply> {
  const text = modalText(interaction);
  try {
    const access = await commandAccess(interaction.member);
    if (access.kind !== 'ok') {
      const reason = access.kind === 'banned' ? BANNED.content : roleRequired(access.roleId);
      return privateMessage(`${reason}\n보내려던 의견은 저장하지 않았어요.\n${quoteRest(text)}`);
    }
    return await runFeedback(interaction, access.userId);
  } catch (error) {
    const id = reportFailure('api/discord.feedback', error);
    return privateMessage(`의견을 저장하지 못했어요. 잠시 후 다시 보내 주세요. 아래 글을 복사해 두세요.\n-# 오류 ID: ${id}\n${quoteRest(text)}`);
  }
}

async function processCommand(interaction: Interaction): Promise<Reply> {
  if (interaction.type === 5) return processFeedback(interaction);
  const access = await commandAccess(interaction.member);
  if (access.kind === 'banned') return BANNED;
  if (access.kind === 'no_role') return privateMessage(roleRequired(access.roleId));
  return interaction.type === 2 ? runCommand(interaction, access.userId) : runComponent(interaction, access.userId);
}

export async function completeInteraction(interaction: Interaction) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reply: Reply;
  const started = Date.now();
  try {
    // A timeout answers the user within the route budget. Shared Steam/cache requests are not cancelled.
    reply = await Promise.race([processCommand(interaction), new Promise<Message>(resolve => {
      timer = setTimeout(() => resolve(privateMessage('조회 시간이 길어 마치지 못했어요. 잠시 후 다시 실행해 주세요.')), WORK_BUDGET_MS);
    })]);
  } catch (error) {
    // 작업 이름·분류·위치만 남긴다(원문 메시지·토큰 없음). 오류 ID로 서버 로그의 [failure]를 찾는다.
    const id = reportFailure('api/discord.interaction', error);
    reply = privateMessage(`명령을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.\n-# 오류 ID: ${id}`);
  } finally { clearTimeout(timer); }
  const elapsed = Date.now() - started;
  await deliverReply(interaction, reply);
  // 사용량(intent/0003)은 응답을 보낸 뒤 센다. 실패해도 응답은 이미 끝났다.
  try { await recordUsage(actionName(interaction), interaction.member.user.id, elapsed); }
  catch (error) { reportFailure('api/discord.usage', error); }
}

async function deliverReply(interaction: Interaction, reply: Reply) {
  const { application_id: app, token } = interaction;
  const ack = ackFor(interaction);
  if (reply && 'public' in reply) {
    await editReply(app, token, reply.public);
  } else if (reply && 'edit' in reply) {
    // 버튼이 달린 메시지를 그 자리에서 고친다(update 응답의 @original이 그 메시지다).
    await editReply(app, token, reply.edit);
  } else if (ack === 'public') {
    // 공개로 시작한 응답이 오류로 끝나면 공개 자리를 지우고 본인에게만 알린다.
    await deleteReply(app, token);
    if (reply) await followUp(app, token, reply);
  } else if (ack === 'update') {
    if (reply) await followUp(app, token, reply);
  } else {
    await editReply(app, token, reply ?? privateMessage('처리했어요.'));
  }
}

// No DB or upstream request before the acknowledgement: Discord requires the initial response within 3s.
export async function receiveInteraction(request: Request, defer: (work: () => Promise<void>) => void, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const key = env.DISCORD_PUBLIC_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key)) return Response.json({ error: 'Discord interactions are not configured' }, { status: 503 });
  if (Number(request.headers.get('content-length')) > 65_536) return Response.json({ error: 'Payload too large' }, { status: 413 });
  let bytes: Uint8Array | null;
  try { bytes = await readPayload(request); }
  catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  if (!bytes) return Response.json({ error: 'Payload too large' }, { status: 413 });
  if (!verifyInteraction(bytes, request.headers.get('x-signature-ed25519'), request.headers.get('x-signature-timestamp'), key)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = interactionSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid interaction' }, { status: 400 });
  const interaction = parsed.data;
  if (interaction.type === 1) return Response.json({ type: 1 });
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_GUILD_ID || interaction.application_id !== env.DISCORD_CLIENT_ID || interaction.guild_id !== env.DISCORD_GUILD_ID) {
    return Response.json({ type: 4, data: { ...privateMessage('재망호 서버에서만 이용할 수 있는 명령이에요.'), flags: 64 } });
  }
  // 의견 명령은 첫 응답이 입력창이다(DB 없음). 제출(type 5)이 오면 그때 요청자 확인·저장한다.
  if (interaction.type === 2 && interaction.data.name === '의견') return Response.json(feedbackModal('feedback:cmd'));
  if (interaction.type === 2 && interaction.data.name === '재순이에게 전달') {
    return Response.json(feedbackModal(interaction.channel_id ? `feedback:msg:${interaction.channel_id}:${interaction.data.target_id}` : 'feedback:cmd'));
  }
  defer(() => completeInteraction(interaction));
  return Response.json(ACK_BODY[ackFor(interaction)]);
}
