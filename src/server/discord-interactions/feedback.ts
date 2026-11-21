import { db } from '../db';
import { pool } from '../pool';

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
  id: string; userId: string | null; discordId: string; body: string;
  source: 'command' | 'message'; messageLink: string | null;
}

// 같은 interaction ID는 한 번만 저장한다(Discord 재전송). 같은 사람의 제출은 트랜잭션 잠금으로 한 줄로 세워
// 개수 확인과 저장 사이에 다른 제출이 끼지 않게 한다(동시 제출에도 24시간 5건을 넘지 않는다).
export async function saveFeedback(input: FeedbackInput): Promise<'saved' | 'limited'> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('member_feedback:' || $1))`, [input.discordId]);
    if ((await client.query('select 1 from member_feedback where id = $1', [input.id])).rowCount) { await client.query('commit'); return 'saved'; }
    const { rows: [{ n }] } = await client.query<{ n: number }>(`select count(*)::int as n from member_feedback
      where discord_id = $1 and created_at > now() - interval '24 hours'`, [input.discordId]);
    if (n >= DAILY_LIMIT) { await client.query('commit'); return 'limited'; }
    await client.query(`insert into member_feedback (id, user_id, discord_id, body, source, message_link) values ($1, $2, $3, $4, $5, $6)`,
      [input.id, input.userId, input.discordId, input.body, input.source, input.messageLink]);
    await client.query('commit');
    return 'saved';
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export interface FeedbackItem { name: string | null; discordId: string; body: string; messageLink: string | null; createdAt: string }

// 관리자 /개선에 붙이는 최근 7일 의견 수와 최신 5건.
export async function recentFeedback(): Promise<{ count: number; items: FeedbackItem[] }> {
  const sql = await db();
  const [{ count }] = await sql`select count(*)::int as count from member_feedback where created_at > now() - interval '7 days'`;
  // 사이트 계정 없이 보낸 의견(intent/0004)은 이름이 없어 디스코드 멘션으로 보인다.
  const rows = await sql`select u.name, f.discord_id as "discordId", f.body, f.message_link as "messageLink", f.created_at as "createdAt"
    from member_feedback f left join "user" u on u.id = f.user_id
    where f.created_at > now() - interval '7 days' order by f.created_at desc, f.id desc limit 5`;
  return { count: count as number, items: rows.map(row => ({ name: (row.name as string | null) ?? null, discordId: row.discordId as string, body: row.body as string,
    messageLink: (row.messageLink as string | null) ?? null, createdAt: new Date(row.createdAt as string).toISOString() })) };
}

export async function purgeOldFeedback() {
  const sql = await db();
  await sql`delete from member_feedback where created_at < now() - interval '90 days'`;
}
