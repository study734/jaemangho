import { db } from '../db';
import type { Interaction } from './protocol';

// 디스코드 기능 사용량(intent/0003-discord-usage-metrics). 누가 썼는지는 영구 집계에 남기지 않는다.
// 하루 사용자 수를 세려고 (날짜, 기능, 디스코드 ID)를 임시로 두고, 운영 점검이 전날보다 오래된 행을 지운다.

const PARTY: Record<string, string> = {
  pick: '하나 뽑기', deals: '세일', missions: '같이 도전', common: '모두 가진 게임', more: '다른 추천',
  again: '지난번 멤버로', mission: '도전 고르기', pref: '기준 바꾸기', recruit: '이 게임으로 모집',
};
const LOBBY: Record<string, string> = { join: '참여', leave: '나가기', close: '마감', recommend: '게임추천' };

// 사람이 읽는 기능 이름. 입력값·ID는 넣지 않는다(이름 종류가 정해져 있어 집계 행이 늘지 않는다).
export function actionName(interaction: Interaction): string {
  if (interaction.type === 2) {
    const { data } = interaction;
    if (data.type === 3) return data.name;
    const sub = data.name === '운영' ? data.options[0]?.name : undefined;
    return sub ? `/${data.name} ${sub}` : `/${data.name}`;
  }
  if (interaction.type === 5) return interaction.data.custom_id.startsWith('feedback:msg:') ? '의견 제출 (메시지)' : '의견 제출';
  const [prefix, , action] = interaction.data.custom_id.split(':');
  if (prefix === 'party') return `게임추천 › ${PARTY[action] ?? '기타'}`;
  if (prefix === 'lobby') return `모집 › ${LOBBY[action] ?? '기타'}`;
  if (prefix === 'steamrec') return '게임추천 › 친구 선택';
  if (prefix === 'lol') return '전적 › 소환사 선택';
  return '기타';
}

// 임시 ID 삽입과 집계 갱신을 한 문장으로 한다. 같은 사람이 동시에 눌러도 그날 사용자는 1명이다.
export async function recordUsage(action: string, discordId: string, ms: number) {
  const sql = await db();
  const elapsed = Math.max(0, Math.min(2_147_483_647, Math.round(ms)));
  await sql`with today as (select (now() at time zone 'Asia/Seoul')::date as day),
      fresh as (insert into discord_usage_users (day, action, discord_id) select day, ${action}, ${discordId} from today
        on conflict do nothing returning 1)
    insert into discord_usage (day, action, uses, users, total_ms, max_ms)
      select day, ${action}, 1, (select count(*) from fresh)::int, ${elapsed}, ${elapsed} from today
    on conflict (day, action) do update set uses = discord_usage.uses + 1, users = discord_usage.users + excluded.users,
      total_ms = discord_usage.total_ms + excluded.total_ms, max_ms = greatest(discord_usage.max_ms, excluded.max_ms)`;
}

export interface UsageRow { action: string; uses: number; previous: number; maxUsers: number; avgMs: number }

// 최근 7일(오늘 포함)과 그 전 7일. 하루 사용자 수는 날짜별 고유 값이라 7일 고유 사용자가 아니어서 하루 최대로 보여준다.
export async function usageReport(limit = 8): Promise<UsageRow[]> {
  const sql = await db();
  const rows = await sql`with t as (select (now() at time zone 'Asia/Seoul')::date as today)
    select u.action,
      sum(u.uses) filter (where u.day > t.today - 7)::int as uses,
      coalesce(sum(u.uses) filter (where u.day <= t.today - 7), 0)::int as previous,
      max(u.users) filter (where u.day > t.today - 7)::int as "maxUsers",
      round(sum(u.total_ms) filter (where u.day > t.today - 7) / nullif(sum(u.uses) filter (where u.day > t.today - 7), 0))::int as "avgMs"
    from discord_usage u, t where u.day > t.today - 14
    group by u.action having sum(u.uses) filter (where u.day > t.today - 7) > 0
    order by uses desc, u.action limit ${limit}`;
  return rows as unknown as UsageRow[];
}

export async function purgeUsage() {
  const sql = await db();
  await sql`delete from discord_usage_users where day < (now() at time zone 'Asia/Seoul')::date - 1`;
  await sql`delete from discord_usage where day < (now() at time zone 'Asia/Seoul')::date - 365`;
}
