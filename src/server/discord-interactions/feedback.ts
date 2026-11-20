import { db } from '../db';

// 멤버 의견(intent/0002-member-feedback-channel). 저장·조회·보존 정리 SQL은 여기에만 둔다.
// 의견 원문은 로그·오류 기록에 남기지 않는다. 원래 메시지 내용은 받지도 저장하지도 않고 위치(링크)만 둔다.
export const FEEDBACK_MAX = 1000;
const DAILY_LIMIT = 5;

// 입력창(modal). 첫 응답으로 바로 보내므로 DB·외부 호출이 없다(3초 규칙). 메시지 우클릭은 위치만 custom_id에 담는다.
export function feedbackModal(customId: string) {
  return { type: 9, data: { custom_id: customId, title: '재순이에게 의견 보내기', components: [{ type: 1, components: [{
    type: 4, custom_id: 'body', style: 2, label: '불편한 점이나 바라는 점', min_length: 1, max_length: FEEDBACK_MAX, required: true,
    placeholder: '예: 게임추천이 느려요 / 이런 기능이 있으면 좋겠어요',
  }] }] } };
}

export interface FeedbackInput {
  id: string; userId: string; discordId: string; body: string;
  source: 'command' | 'message'; messageLink: string | null;
}

// 같은 interaction ID는 한 번만 저장한다(Discord 재전송). 한도 판단과 저장을 한 문장으로 해 동시 제출에도 5건을 넘지 않게 한다.
export async function saveFeedback(input: FeedbackInput): Promise<'saved' | 'limited'> {
  const sql = await db();
  const [existing] = await sql`select 1 from member_feedback where id = ${input.id}`;
  if (existing) return 'saved';
  const rows = await sql`insert into member_feedback (id, user_id, discord_id, body, source, message_link)
    select ${input.id}, ${input.userId}, ${input.discordId}, ${input.body}, ${input.source}, ${input.messageLink}
    where (select count(*) from member_feedback where discord_id = ${input.discordId} and created_at > now() - interval '24 hours') < ${DAILY_LIMIT}
    on conflict (id) do nothing returning id`;
  if (rows.length) return 'saved';
  const [again] = await sql`select 1 from member_feedback where id = ${input.id}`;
  return again ? 'saved' : 'limited';
}

export interface FeedbackItem { name: string; body: string; messageLink: string | null; createdAt: string }

// 관리자 /개선에 붙이는 최근 7일 의견 수와 최신 5건.
export async function recentFeedback(): Promise<{ count: number; items: FeedbackItem[] }> {
  const sql = await db();
  const [{ count }] = await sql`select count(*)::int as count from member_feedback where created_at > now() - interval '7 days'`;
  const rows = await sql`select u.name, f.body, f.message_link as "messageLink", f.created_at as "createdAt"
    from member_feedback f join "user" u on u.id = f.user_id
    where f.created_at > now() - interval '7 days' order by f.created_at desc, f.id desc limit 5`;
  return { count: count as number, items: rows.map(row => ({ name: row.name as string, body: row.body as string,
    messageLink: (row.messageLink as string | null) ?? null, createdAt: new Date(row.createdAt as string).toISOString() })) };
}

export async function purgeOldFeedback() {
  const sql = await db();
  await sql`delete from member_feedback where created_at < now() - interval '90 days'`;
}
