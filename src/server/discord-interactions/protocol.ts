import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

export const snowflake = z.string().regex(/^\d{17,20}$/);
export const scopeSchema = z.enum(['all', 'any', 'unowned']);
export const preferenceSchema = z.enum(['balanced', 'familiar', 'fresh', 'recent']);
export type Scope = z.infer<typeof scopeSchema>;
export type Preference = z.infer<typeof preferenceSchema>;
// Only Discord's own CDN URLs are forwarded to the lookup service.
const attachment = z.object({
  url: z.string().url().refine(url => ['cdn.discordapp.com', 'media.discordapp.net'].includes(new URL(url).hostname)),
  content_type: z.string().optional(),
});
const envelope = {
  id: snowflake,
  application_id: snowflake,
  token: z.string().regex(/^[\w.-]{1,256}$/),
  guild_id: snowflake,
  // permissions: 이 채널에서의 현재 권한 비트필드(Discord가 서명). 관리자 명령 실행 조건에 쓴다.
  member: z.object({ user: z.object({ id: snowflake }), permissions: z.string().regex(/^\d{1,20}$/).optional() }),
};
const stringOption = <N extends string, V extends z.ZodTypeAny>(name: N, value: V) => z.object({ name: z.literal(name), type: z.literal(3), value });
const subcommand = <N extends string>(name: N) => z.object({ name: z.literal(name), type: z.literal(1) });

// 슬래시·메시지 명령. 이름이 commands.json과 같아야 하며, 모르는 이름·옵션은 400으로 거부한다.
const commandData = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('게임추천'), type: z.literal(1),
    options: z.array(z.discriminatedUnion('name', [stringOption('범위', scopeSchema), stringOption('기준', preferenceSchema)]))
      .max(2).refine(options => new Set(options.map(option => option.name)).size === options.length).optional(),
  }),
  z.object({ name: z.literal('패치노트'), type: z.literal(1) }),
  // 하위 명령(시상식·개념글·순간)이던 이전 정의는 배포가 바뀌는 동안 올 수 있어 받아 주되 무시한다.
  z.object({
    name: z.literal('기록'), type: z.literal(1),
    options: z.tuple([z.discriminatedUnion('name', [subcommand('시상식'), subcommand('개념글'), subcommand('순간')])]).optional(),
  }),
  z.object({
    name: z.literal('멤버'), type: z.literal(1),
    options: z.array(z.object({ name: z.literal('대상'), type: z.literal(6), value: snowflake })).max(1).optional(),
  }),
  z.object({
    name: z.literal('전적'), type: z.literal(1),
    options: z.array(stringOption('닉네임', z.string().trim().min(3).max(60))).max(1).optional(),
  }),
  // 관리자 전용(실행 조건은 access.ts의 adminUser)
  z.object({ name: z.literal('개선'), type: z.literal(1) }),
  z.object({
    name: z.literal('운영'), type: z.literal(1),
    options: z.tuple([z.discriminatedUnion('name', [subcommand('상태'), subcommand('점검'), subcommand('동기화'),
      z.object({ name: z.literal('캐시'), type: z.literal(1), options: z.tuple([stringOption('종류', z.enum(['steam', 'riot']))]) })])]),
  }),
  z.object({
    name: z.literal('출처 찾기'), type: z.literal(3), target_id: snowflake,
    resolved: z.object({ messages: z.record(snowflake, z.object({ attachments: z.array(attachment).max(10).default([]) })) }),
  }),
]);

// 메시지 구성요소. custom_id 형식이 곧 상태다(최대 100자). 파티 버튼은 DB의 파티 id만 담는다.
export const PARTY_ACTIONS = ['pick', 'deals', 'missions', 'common'] as const;
export type PartyAction = typeof PARTY_ACTIONS[number];
const componentData = z.union([
  // 친구 선택: v1(배포 전 열린 선택창)은 기준 없이 balanced로 처리한다.
  z.object({
    component_type: z.literal(5),
    custom_id: z.string().regex(/^steamrec:(v1:\d{17,20}:(all|any|unowned)|v2:\d{17,20}:(all|any|unowned):(balanced|familiar|fresh|recent)):\d{10}$/),
    values: z.array(snowflake).min(2).max(20).refine(ids => new Set(ids).size === ids.length),
  }),
  z.object({ component_type: z.literal(2), custom_id: z.string().regex(/^party:\d{17,20}:(pick(:\d{1,10})?|deals|missions|common)$/) }),
  z.object({ component_type: z.literal(3), custom_id: z.string().regex(/^party:\d{17,20}:mission$/), values: z.tuple([z.string().regex(/^\d{1,10}$/)]) }),
  z.object({ component_type: z.literal(3), custom_id: z.string().regex(/^lol:v1:\d{17,20}:\d{10}$/), values: z.tuple([z.string().regex(/^[\w-]{1,32}$/)]) }),
]);

export const interactionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(1) }),
  z.object({ ...envelope, type: z.literal(2), data: commandData }),
  z.object({ ...envelope, type: z.literal(3), data: componentData }),
]);
export type Interaction = Exclude<z.infer<typeof interactionSchema>, { type: 1 }>;
export type CommandInteraction = Extract<Interaction, { type: 2 }>;
export type ComponentInteraction = Extract<Interaction, { type: 3 }>;
export type Message = { content: string; components?: unknown[]; allowed_mentions?: { parse: string[] } };
export const privateMessage = (content: string, components: unknown[] = []): Message => ({ content, components, allowed_mentions: { parse: [] } });

// 디스코드 메시지 한도(2000자)를 넘기지 않는다. 표시 이름의 마크다운·줄바꿈은 글자 그대로 보이게 한다.
export const MESSAGE_LIMIT = 2000;
export const fit = (content: string) => content.length <= MESSAGE_LIMIT ? content : `${content.slice(0, MESSAGE_LIMIT - 70)}\n\n표시가 길어 일부 내용을 줄였어요.`;
export const label = (name: string, max = 80) => name.replace(/[\r\n]/g, ' ').slice(0, max).replace(/[\\`*_~|[\]<>]/g, '\\$&');
export const mention = (discordId: string) => `<@${discordId}>`;
// 디스코드에 맞지 않는 흐름(로그인·Steam 연결·동의·취향 설정)은 사이트로 안내한다.
export const SITE = 'https://www.jaemangho.shop';

// Verify the exact bytes before parsing JSON. A fresh timestamp limits replay of signed requests.
export function verifyInteraction(body: Uint8Array, signature: string | null, timestamp: string | null, publicKey: string, now = Date.now()): boolean {
  if (!/^[a-f\d]{64}$/i.test(publicKey) || !signature || !/^[a-f\d]{128}$/i.test(signature)
    || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300_000) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}

// 선택창은 발급한 사람만, 15분 안에만 쓸 수 있다.
const PICKER_TTL_MS = 900_000;
export function ownedFresh(owner: string, issuedAt: string, interaction: ComponentInteraction, now = Date.now()) {
  const age = now - Number(issuedAt) * 1000;
  return owner === interaction.member.user.id && age >= 0 && age <= PICKER_TTL_MS;
}

export function selection(interaction: ComponentInteraction, now = Date.now()) {
  const parts = interaction.data.custom_id.split(':');
  if (parts[0] !== 'steamrec' || !('values' in interaction.data)) return null;
  const [, version, owner, selectedScope] = parts;
  const preference = version === 'v2' ? parts[4] : 'balanced';
  if (!ownedFresh(owner, parts.at(-1)!, interaction, now)) return null;
  return { ids: interaction.data.values, scope: scopeSchema.parse(selectedScope), preference: preferenceSchema.parse(preference) };
}

export function friendPicker(owner: string, selectedScope: Scope, preference: Preference = 'balanced', now = Date.now()): Message {
  return {
    content: '함께할 친구 2~20명을 선택해 주세요. 본인도 함께하면 직접 선택해 주세요. 선택하면 바로 추천합니다.',
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [{ type: 5,
      custom_id: `steamrec:v2:${owner}:${selectedScope}:${preference}:${Math.floor(now / 1000)}`,
      placeholder: '함께할 친구 선택 (본인도 직접 선택)', min_values: 2, max_values: 20,
    }] }],
  };
}
