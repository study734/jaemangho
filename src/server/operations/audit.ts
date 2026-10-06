import { db } from '../db';

interface Actor { id: string; name: string }

// 작업보다 먼저 이력을 만든다. 완료 기록이 실패하면 '진행/결과 확인 필요'로 남아 조용히 사라지지 않는다.
export async function audited<T>(actor: Actor, action: string, target: string, work: () => Promise<T>): Promise<T> {
  const sql = await db();
  const [entry] = await sql`insert into ops_audit (actor_id, actor_name, action, target, result)
    values (${actor.id}, ${actor.name}, ${action}, ${target}, 'started') returning id`;
  try {
    const result = await work();
    await sql`update ops_audit set result = 'success', finished_at = now() where id = ${entry.id}`
      .catch(() => console.error('audit completion failed; entry remains started'));
    return result;
  } catch (error) {
    await sql`update ops_audit set result = 'failed', finished_at = now() where id = ${entry.id}`
      .catch(() => console.error('audit failure completion failed; entry remains started'));
    throw error;
  }
}
