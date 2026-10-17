// AI conversation is suspended. These legacy endpoints must never start a
// model, tool lookup, preference write or quota transaction, even if an old key
// remains in the deployment environment.
export const AI_DISABLED_MESSAGE = 'AI 대화 서비스는 운영을 중단했어요. 질문 전송과 자료 첨부는 사용할 수 없어요.';

export function aiDisabledResponse() {
  return Response.json({ code: 'ai_disabled', error: AI_DISABLED_MESSAGE }, {
    status: 410, headers: { 'Cache-Control': 'no-store' },
  });
}
