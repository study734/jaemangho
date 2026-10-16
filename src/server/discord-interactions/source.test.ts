import { describe, expect, it, vi } from 'vitest';
import { interactionSchema, type Interaction } from './protocol';
import { findSource } from './source';

const id = '100000000000000009';
const interaction = (attachments: unknown[], host = 'cdn.discordapp.com') => interactionSchema.safeParse({
  id, application_id: id, token: 'fixture-token', guild_id: id, member: { user: { id } }, type: 2,
  data: { name: '출처 찾기', type: 3, target_id: id, resolved: { messages: { [id]: { attachments: attachments.map(a => ({ url: `https://${host}/a.png?ex=1`, ...a as object })) } } } },
});
const command = (attachments: unknown[]) => {
  const parsed = interaction(attachments);
  if (!parsed.success) throw new Error('fixture rejected');
  return (parsed.data as Extract<Interaction, { type: 2 }>).data as Parameters<typeof findSource>[0];
};
const trace = (result: unknown[], status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ result }), { status }));
const hit = (similarity: number, extra = {}) => ({ anilist: { id: 1535, title: { native: '死亡遊戯', romaji: 'Death Note', english: null } },
  episode: 3, from: 754.4, similarity, ...extra });

describe('findSource', () => {
  it('asks for a media message when nothing usable is attached, without calling the lookup service', async () => {
    const fetchFn = vi.fn();
    expect((await findSource(command([]), fetchFn)).content).toContain('첨부된 메시지');
    expect((await findSource(command([{ content_type: 'application/pdf' }]), fetchFn)).content).toContain('첨부된 메시지');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('forwards the attachment URL encoded and reports title, episode, time and similarity privately', async () => {
    const fetchFn = trace([hit(0.97)]);
    const message = await findSource(command([{ content_type: 'image/png' }]), fetchFn);
    expect(fetchFn.mock.calls[0][0]).toContain(`url=${encodeURIComponent('https://cdn.discordapp.com/a.png?ex=1')}`);
    expect(message.content).toContain('**死亡遊戯 (Death Note)** 3화 · 12:34 부근 · 일치도 97%');
    expect(message.content).toContain('<https://anilist.co/anime/1535>');
    expect(message.content).not.toContain('다른 작품');
    expect(message.allowed_mentions).toEqual({ parse: [] });
  });
  it('warns on low similarity and tolerates a missing or array episode', async () => {
    const low = await findSource(command([{ content_type: 'image/png' }]), trace([hit(0.8, { episode: null })]));
    expect(low.content).toContain('다른 작품일 수 있어요');
    expect(low.content).not.toContain('화 ·');
    expect((await findSource(command([{ content_type: 'video/mp4' }]), trace([hit(0.95, { episode: [1, 2] })]))).content).toContain('1, 2화');
  });
  it('separates empty results, exhausted quota, malformed responses and network failure', async () => {
    const attachments = [{ content_type: 'image/png' }];
    expect((await findSource(command(attachments), trace([]))).content).toContain('찾지 못했어요');
    for (const status of [402, 429]) expect((await findSource(command(attachments), trace([], status))).content).toContain('한도');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await findSource(command(attachments), vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))).content).toContain('출처를 찾지 못했어요');
    expect((await findSource(command(attachments), vi.fn().mockRejectedValue(new Error('down')))).content).toContain('연결하지 못했어요');
  });
  it('rejects attachment URLs outside the Discord CDN before anything is forwarded', () => {
    expect(interaction([{ content_type: 'image/png' }], 'example.com').success).toBe(false);
    expect(interaction([{ content_type: 'image/png' }], 'media.discordapp.net').success).toBe(true);
  });
});
