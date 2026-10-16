import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

export const snowflake = z.string().regex(/^\d{17,20}$/);
const scope = z.enum(['all', 'any', 'unowned']);
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
  member: z.object({ user: z.object({ id: snowflake }) }),
};
export const interactionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(1) }),
  z.object({ ...envelope, type: z.literal(2), data: z.discriminatedUnion('name', [
    z.object({
      name: z.literal('게임추천'), type: z.literal(1),
      options: z.array(z.object({ name: z.literal('범위'), type: z.literal(3), value: scope })).max(1).optional(),
    }),
    z.object({ name: z.literal('패치노트'), type: z.literal(1) }),
    z.object({
      name: z.literal('출처 찾기'), type: z.literal(3), target_id: snowflake,
      resolved: z.object({ messages: z.record(snowflake, z.object({ attachments: z.array(attachment).max(10).default([]) })) }),
    }),
  ]) }),
  z.object({ ...envelope, type: z.literal(3), data: z.object({
    component_type: z.literal(5),
    custom_id: z.string().regex(/^steamrec:v1:\d{17,20}:(all|any|unowned):\d{10}$/),
    values: z.array(snowflake).min(2).max(20).refine(ids => new Set(ids).size === ids.length),
  }) }),
]);
export type Interaction = Exclude<z.infer<typeof interactionSchema>, { type: 1 }>;
export type Message = { content: string; components?: unknown[]; allowed_mentions?: { parse: string[] } };
export const privateMessage = (content: string): Message => ({ content, components: [], allowed_mentions: { parse: [] } });

// Verify the exact bytes before parsing JSON. A fresh timestamp limits replay of signed requests.
export function verifyInteraction(body: Uint8Array, signature: string | null, timestamp: string | null, publicKey: string, now = Date.now()): boolean {
  if (!/^[a-f\d]{64}$/i.test(publicKey) || !signature || !/^[a-f\d]{128}$/i.test(signature)
    || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300_000) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}

export function selection(interaction: Extract<Interaction, { type: 3 }>, now = Date.now()) {
  const [, , owner, selectedScope, issuedAt] = interaction.data.custom_id.split(':');
  const age = now - Number(issuedAt) * 1000;
  if (owner !== interaction.member.user.id || age < 0 || age > 900_000) return null;
  return { ids: interaction.data.values, scope: scope.parse(selectedScope) };
}

export function friendPicker(owner: string, selectedScope: z.infer<typeof scope>, now = Date.now()): Message {
  return {
    content: '함께할 친구 2~20명을 선택해 주세요. 본인도 함께하면 직접 선택해 주세요. 선택하면 바로 추천합니다.',
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [{ type: 5,
      custom_id: `steamrec:v1:${owner}:${selectedScope}:${Math.floor(now / 1000)}`,
      placeholder: '함께할 친구 선택 (본인도 직접 선택)', min_values: 2, max_values: 20,
    }] }],
  };
}
