import { describe, expect, it } from 'vitest';
import { parseAnalysis } from './input';
const request = (body: string, origin?: string) => new Request('https://example.com/api/ai', {
  method: 'POST', body, headers: origin ? { origin } : undefined,
});
describe('analysis request contract', () => {
  it('strips unrelated identifiers and raw text, including nested fields', async () => {
    const result = await parseAnalysis(request(JSON.stringify({ context: { topic: 'activity', period: 'recent-seven-days',
      unavailable: true, highlights: [{ reactions: 1, replies: 2, authorName: 'private-name', url: 'private-url' }], moments: [], awards: [], rawText: 'private-chat' },
      apiKey: 'private-key', question: '설명' })));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-');
    if (result.ok) expect(result.data.context).toMatchObject({ unavailable: true });
  });
  it.each(['{', JSON.stringify({ context: { topic: 'unknown' } }), JSON.stringify({ context: { topic: 'general' }, question: 'x'.repeat(601) })])('rejects invalid input', async body => {
    const result = await parseAnalysis(request(body));
    expect(!result.ok && result.response.status).toBe(400);
  });
  it('bounds request bytes and rejects cross-origin calls', async () => {
    const oversized = await parseAnalysis(request('x'.repeat(128001)));
    expect(!oversized.ok && oversized.response.status).toBe(413);
    const cross = await parseAnalysis(request('{}', 'https://other.example'));
    expect(!cross.ok && cross.response.status).toBe(403);
  });
});
