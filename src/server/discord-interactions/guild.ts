import { z } from 'zod';
import { reportFailure } from '../diagnostics';
import { fit, label, privateMessage, type Message } from './protocol';

// /지금: Discord 공개 API로 "지금 누가 무슨 게임 중인지"를 한 메시지로 모아 보여준다(디스코드 화면에는 사람별로만 보임).
// 읽기만 하고 저장하지 않는다. 서버 위젯(GET /guilds/{id}/widget.json, 서버 설정의 위젯이 켜져 있어야 함, 인증 없음)과
// 서버 인원(GET /guilds/{id}?with_counts=true, 봇 토큰)을 동시에 조회한다. 위젯은 멤버 id를 감추므로 사람별 계정과 잇지 않고
// 집계만 한다. 두 조회는 따로 실패할 수 있어 서로 막지 않고, 실패한 부분만 알린다(빈 결과와 구분).
const API = 'https://discord.com/api/v10';
export interface GuildDeps { guildId: string; token: string | undefined; fetchFn?: typeof fetch }

class DiscordApiError extends Error {
  readonly code: string;
  constructor(status: number) { super(`discord_http_${status}`); this.code = `discord_http_${status}`; }
}

async function getJson<T>(url: string, schema: z.ZodType<T>, { token, fetchFn = fetch }: { token?: string; fetchFn?: typeof fetch }): Promise<T> {
  const response = await fetchFn(url, { headers: token ? { Authorization: `Bot ${token}` } : {}, signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new DiscordApiError(response.status);
  return schema.parse(await response.json());
}

const widgetSchema = z.object({
  channels: z.array(z.object({ id: z.string(), name: z.string(), position: z.number().optional() })).default([]),
  members: z.array(z.object({
    username: z.string(), status: z.string().optional(), channel_id: z.string().nullish(),
    // 예전 이름(game)과 새 이름(activity)을 모두 받는다.
    activity: z.object({ name: z.string() }).nullish(), game: z.object({ name: z.string() }).nullish(),
  })).default([]),
  presence_count: z.number().optional(),
});
const countsSchema = z.object({ approximate_member_count: z.number(), approximate_presence_count: z.number() });

export interface NowSnapshot {
  online: number | null; total: number | null;
  voice: { name: string; people: string[] }[];
  games: { name: string; count: number }[];
  failures: ('widget' | 'counts')[];
  widgetDisabled: boolean;
}

export async function guildNow({ guildId, token, fetchFn }: GuildDeps): Promise<NowSnapshot> {
  const [widget, counts] = await Promise.allSettled([
    getJson(`${API}/guilds/${guildId}/widget.json`, widgetSchema, { fetchFn }),
    token ? getJson(`${API}/guilds/${guildId}?with_counts=true`, countsSchema, { token, fetchFn }) : Promise.reject(new DiscordApiError(0)),
  ]);
  const failures: NowSnapshot['failures'] = [];
  if (widget.status === 'rejected') { failures.push('widget'); reportFailure('api/discord.widget', widget.reason); }
  if (counts.status === 'rejected') { failures.push('counts'); if (token) reportFailure('api/discord.guild-counts', counts.reason); }
  const members = widget.status === 'fulfilled' ? widget.value.members : [];
  const channels = widget.status === 'fulfilled' ? [...widget.value.channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
  const voice = channels.map(channel => ({ name: channel.name, people: members.filter(m => m.channel_id === channel.id).map(m => m.username) }))
    .filter(channel => channel.people.length);
  const byGame = new Map<string, number>();
  for (const member of members) {
    const game = (member.activity ?? member.game)?.name.trim();
    if (game) byGame.set(game, (byGame.get(game) ?? 0) + 1);
  }
  return {
    online: counts.status === 'fulfilled' ? counts.value.approximate_presence_count : widget.status === 'fulfilled' ? widget.value.presence_count ?? null : null,
    total: counts.status === 'fulfilled' ? counts.value.approximate_member_count : null,
    voice, games: [...byGame].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    failures,
    // 50004: 위젯이 꺼져 있음(서버 설정 → 위젯). 403으로 온다.
    widgetDisabled: widget.status === 'rejected' && widget.reason instanceof DiscordApiError && widget.reason.code === 'discord_http_403',
  };
}

export function nowMessage(now: NowSnapshot): Message {
  const head = now.online === null ? '' : `온라인 ${now.online.toLocaleString('ko-KR')}명${now.total === null ? '' : ` · 전체 ${now.total.toLocaleString('ko-KR')}명`}`;
  const widgetNote = now.widgetDisabled ? '서버 위젯이 꺼져 있어 음성 채널과 게임을 볼 수 없어요(서버 설정 → 위젯에서 켜 주세요).'
    : '음성 채널과 게임 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
  const widgetOk = !now.failures.includes('widget');
  return privateMessage(fit([
    '### 🟢 지금 재망호',
    ...(head ? [`-# ${head}`] : []),
    '**🔊 음성 채널**',
    ...(!widgetOk ? [widgetNote] : now.voice.length ? now.voice.map(channel => `${label(channel.name)} — ${channel.people.length}명 (${channel.people.map(name => label(name, 32)).join(', ')})`) : ['음성 채널에 있는 사람이 없어요.']),
    '**🎮 하고 있는 게임**',
    ...(!widgetOk ? ['—'] : now.games.length ? [now.games.slice(0, 10).map(game => `${label(game.name, 40)} ${game.count}명`).join(' · ')] : ['게임 중인 사람이 없어요.']),
    `-# 서버 위젯 기준이에요. 상태를 숨기거나 활동 공유를 끈 멤버는 보이지 않아요.${now.failures.includes('counts') && widgetOk ? ' 서버 인원은 불러오지 못했어요.' : ''}`,
  ].join('\n')));
}
