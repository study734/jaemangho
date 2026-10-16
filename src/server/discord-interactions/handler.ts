import { canUseCommand } from './access';
import { gameRecommendations } from './games';
import { discordPatchNotesText } from '../../lib/patch-notes';
import { findSource } from './source';
import { friendPicker, interactionSchema, privateMessage, selection, verifyInteraction, type Interaction, type Message } from './protocol';

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

// Only an error code/status is logged: interaction tokens and webhook URLs must never reach logs.
export async function editReply(applicationId: string, token: string, message: Message, fetchFn: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(`${API}/webhooks/${applicationId}/${token}/messages/@original`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message), signal: AbortSignal.timeout(3000), cache: 'no-store',
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

async function processCommand(interaction: Interaction): Promise<Message> {
  const userId = interaction.member.user.id;
  if (!await canUseCommand(userId)) return privateMessage('프로젝트에 디스코드로 로그인한 뒤 이용해 주세요. 차단된 계정은 이용할 수 없어요.');
  if (interaction.type === 2) {
    const { data } = interaction;
    if (data.name === '패치노트') return privateMessage(discordPatchNotesText());
    return data.name === '출처 찾기' ? findSource(data) : friendPicker(userId, data.options?.[0]?.value ?? 'all');
  }
  const chosen = selection(interaction);
  if (!chosen) return privateMessage('선택창이 만료됐거나 다른 사람의 선택창이에요. /게임추천을 다시 실행해 주세요.');
  return gameRecommendations(chosen.ids, chosen.scope);
}

export async function completeInteraction(interaction: Interaction) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let message: Message;
  try {
    // A timeout answers the user within the route budget. Shared Steam/cache requests are not cancelled.
    message = await Promise.race([processCommand(interaction), new Promise<Message>(resolve => {
      timer = setTimeout(() => resolve(privateMessage('조회 시간이 길어 마치지 못했어요. 잠시 후 다시 실행해 주세요.')), WORK_BUDGET_MS);
    })]);
  } catch {
    console.error('discord interaction processing failed');
    message = privateMessage('명령을 처리하지 못했어요. 연결 설정을 확인하거나 잠시 후 다시 시도해 주세요.');
  } finally { clearTimeout(timer); }
  await editReply(interaction.application_id, interaction.token, message);
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
  defer(() => completeInteraction(interaction));
  return Response.json({ type: 5, data: { flags: 64 } });
}
