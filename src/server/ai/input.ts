import { parseBody, type Parsed } from '../http';
import { analysisSchema, type AnalysisInput } from './context';

// Bound chunked bodies too, before parsing. The route owns authentication;
// this module owns the external request contract and its resource limit.
export async function parseAnalysis(request: Request): Promise<Parsed<AnalysisInput>> {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return { ok: false, response: Response.json({ error: '다른 사이트에서 AI를 호출할 수 없어요.' }, { status: 403 }) };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: Response.json({ error: '분석 자료가 필요해요.' }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128_000) {
        await reader.cancel();
        return { ok: false, response: Response.json({ error: '분석 자료가 너무 커요.' }, { status: 413 }) };
      }
      chunks.push(value);
    }
  } catch { return { ok: false, response: Response.json({ error: '분석 자료를 읽지 못했어요.' }, { status: 400 }) }; }
  return parseBody(new Request(request.url, { method: 'POST', body: Buffer.concat(chunks) }), analysisSchema);
}
