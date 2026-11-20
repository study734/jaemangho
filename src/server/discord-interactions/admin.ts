import { purgeRiotCache } from '../admin';
import { improvementReport } from '../improvements';
import { audited } from '../operations/audit';
import { chatConfigured, runChatSync, SyncBusyError } from '../operations/jobs';
import { checkOperations } from '../operations/monitor';
import { operationStatus } from '../operations/status';
import { purgeSteamCache } from '../steam/cache';
import { postWeeklyAwards, setAwardChannel, type AwardPostResult } from '../chat/award-post';
import { fit, label, privateMessage, SITE, type Message } from './protocol';
import { KIND_LABEL } from '../../lib/improvements';
import { recentFeedback } from './feedback';
import { usageReport, type UsageRow } from './usage';

// 관리자 전용 명령. 웹 /api/admin/operations와 같은 서비스와 작업 이력(audited)을 쓴다.
// 사용자 차단·해제, 소환사 삭제처럼 되돌리기 어려운 작업은 웹 관리자 화면에만 둔다.
export type AdminTask = '개선' | '상태' | '점검' | '동기화' | 'steam' | 'riot' | '시상식채널' | '시상식게시';
type Actor = { id: string; name: string };
const KST = { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;
const when = (value: unknown) => value ? new Date(value as string).toLocaleString('ko-KR', KST) : '없음';
// 디스코드 처리 예산(45초) 안에서 끝나도록 수동 동기화는 웹(50초)보다 짧게 끊고, 남은 부분은 다음 실행이 이어 받는다.
const SYNC_BUDGET_MS = 30_000;

export const ADMIN_DENIED = privateMessage('관리자만 실행할 수 있어요. 디스코드 Administrator 권한과 사이트 관리자 상태(로그인할 때 갱신)가 모두 필요해요.');

export async function adminTask(task: AdminTask, actor: Actor, channelId?: string): Promise<Message> {
  switch (task) {
    case '시상식채널': {
      await audited(actor, channelId ? 'awards.channel.set' : 'awards.channel.clear', 'awards', () => setAwardChannel(channelId ?? null, actor.id));
      return privateMessage(channelId
        ? `주간 시상식을 <#${channelId}>에 자동으로 올릴게요. 채팅 동기화가 지난주 칭호를 계산한 뒤(월요일 새벽) 주마다 한 번 올리며, 눈팅러는 빼요. 봇에 이 채널의 메시지 보내기 권한이 있어야 해요. 지금 시험하려면 /운영 시상식게시를 실행해 주세요.`
        : '주간 시상식 자동 게시를 껐어요. 다시 켜려면 /운영 시상식채널 채널:#채널 을 실행해 주세요.');
    }
    case '시상식게시': {
      const result = await audited(actor, 'awards.post', 'awards', () => postWeeklyAwards({ token: process.env.DISCORD_BOT_TOKEN }));
      return privateMessage(awardPostMessage(result));
    }
    case '개선': return improvements();
    case '상태': return status();
    case '점검': {
      const result = await audited(actor, 'monitor.check', 'operations', () => checkOperations('manual'));
      return privateMessage(result.skipped ? '다른 점검이 진행 중이라 건너뛰었어요. 잠시 후 /운영 상태로 확인해 주세요.' : `운영 점검을 마쳤어요. 활성 경고 ${result.active}개.`);
    }
    case '동기화': {
      if (!chatConfigured()) return privateMessage('채팅 동기화 설정(Discord 봇 토큰·서버 ID)이 없어요.');
      try {
        const result = await audited(actor, 'chat.sync', 'chat', () => runChatSync('manual', {
          token: process.env.DISCORD_BOT_TOKEN!, guildId: process.env.DISCORD_GUILD_ID!, laugh: process.env.CHAT_LAUGH === '1', budgetMs: SYNC_BUDGET_MS,
        }));
        return privateMessage(`채팅 동기화 ${result.status === 'success' ? '완료' : '부분 완료(다음 실행이 이어 받아요)'} · 채널 ${result.channels}개 · 메시지 ${result.messages.toLocaleString('ko-KR')}개`);
      } catch (error) {
        if (error instanceof SyncBusyError) return privateMessage('동기화가 이미 실행 중이에요.');
        throw error;
      }
    }
    case 'steam': {
      const { deleted } = await audited(actor, 'cache.steam.purge', 'steam', purgeSteamCache);
      return privateMessage(`Steam 캐시 ${deleted.toLocaleString('ko-KR')}개를 지웠어요.`);
    }
    case 'riot': {
      const deleted = await audited(actor, 'cache.riot.purge', 'riot', purgeRiotCache);
      return privateMessage(`Riot 캐시 ${deleted.toLocaleString('ko-KR')}개를 지웠어요.`);
    }
  }
}

async function improvements(): Promise<Message> {
  const [report, feedback, usage] = await Promise.all([improvementReport(), recentFeedback(), usageReport()]);
  const head = `📋 개선 우선순위 (최근 7일 열람 ${report.totalViews.current.toLocaleString('ko-KR')}회, 그 전 7일 ${report.totalViews.previous.toLocaleString('ko-KR')}회)`;
  const voices = [...usageLines(usage), ...feedbackLines(feedback)];
  if (!report.items.length) return privateMessage(fit([`${head}\n지금 고칠 경고·실패가 없어요.${report.usageEnough ? '' : ' 열람이 적어 사용량 판단은 하지 않았어요.'}`, ...voices].join('\n\n')));
  const lines = report.items.slice(0, 8).map((item, index) =>
    `${index + 1}. **[${KIND_LABEL[item.kind]}] ${label(item.target)}** — ${item.reasons.map(reason => label(reason, 200)).join(' / ')}${item.next ? `\n   다음: ${item.next}` : ''}`);
  return privateMessage(fit([head, ...lines, ...(report.usageEnough ? [] : ['열람이 적어 사용량 판단(살펴보기·키우기·정리 검토)은 하지 않았어요.']),
    ...voices, `-# [관리자 화면에서 전체 보기](<${SITE}/admin>)`].join('\n\n')));
}

// 디스코드 사용(intent/0003 R6). 하루 사용자 수는 날짜별 고유 값이라 '하루 최대'로 보여준다.
function usageLines(rows: UsageRow[]): string[] {
  if (!rows.length) return [];
  const change = (row: UsageRow) => row.previous ? `${row.uses >= row.previous ? '+' : ''}${Math.round(((row.uses - row.previous) / row.previous) * 100)}%` : '새로';
  return ['🎮 디스코드 사용 (최근 7일, 그 전 7일 대비)', rows.map(row =>
    `- ${label(row.action)} ${row.uses.toLocaleString('ko-KR')}회 (${change(row)}) · 하루 최대 ${row.maxUsers}명 · 평균 ${(row.avgMs / 1000).toFixed(1)}초`).join('\n')];
}

// 멤버 의견(intent/0002 R6). 이름·본문은 마크다운을 이스케이프하고(label) 멘션 알림이 가지 않게 한다.
const DAY = { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' } as const;
function feedbackLines(feedback: Awaited<ReturnType<typeof recentFeedback>>): string[] {
  if (!feedback.count) return [];
  const items = feedback.items.map(item => {
    const body = item.body.length > 200 ? `${item.body.slice(0, 200)}…` : item.body;
    const link = item.messageLink ? ` · [메시지](<${item.messageLink}>)` : '';
    return `- ${label(item.name)} · ${new Date(item.createdAt).toLocaleDateString('ko-KR', DAY)}${link}\n  ${label(body, 201)}`;
  });
  return [`💬 멤버 의견 (최근 7일 ${feedback.count}건)`, ...items];
}

async function status(): Promise<Message> {
  const data = await operationStatus();
  const active = data.alerts.filter(alert => alert.active);
  const latest = data.jobs[0];
  const today = data.steam.stats[0];
  return privateMessage(fit([
    `🛠️ 운영 상태 · 마지막 점검 ${when(data.checkedAt)}`,
    active.length ? `활성 경고 ${active.length}개\n${active.slice(0, 8).map(alert => `• ${alert.severity === 'critical' ? '🔴' : '🟡'} ${label(alert.title, 150)}`).join('\n')}` : '활성 경고 없음',
    `채팅 동기화: ${data.chatConfigured ? `마지막 성공 ${when(data.lastSuccess)}${latest ? ` · 최근 실행 ${latest.status}` : ''}` : '설정 없음'}`,
    `Steam 캐시 ${data.steam.cache.fresh}/${data.steam.cache.rows}개 유효${today ? ` · ${today.day} 적중 ${today.hits} · 미스 ${today.misses} · 오류 ${today.errors}` : ''}`,
    `DB 사용량 모드: ${data.usage?.mode ?? '확인 불가'}${data.usage?.stale ? ' (오래된 표본)' : ''} · 알림 웹훅 ${data.notificationsConfigured ? '설정됨' : '없음'}`,
    `-# [관리자 화면에서 자세히](<${SITE}/admin>)`,
  ].join('\n')));
}

function awardPostMessage(result: AwardPostResult): string {
  switch (result.status) {
    case 'disabled': return '게시 채널이 없거나 봇 토큰이 설정되지 않았어요. /운영 시상식채널 채널:#채널 로 먼저 정해 주세요.';
    case 'no_awards': return '최근 2주 안에 공개로 올릴 시상식이 없어요(눈팅러만 있는 주는 올리지 않아요).';
    case 'already_posted': return '이번 시상식은 이미 올렸어요. 주마다 한 번만 올려요.';
    case 'posted': return `<#${result.channelId}>에 ${result.week} 주 시상식을 올렸어요.`;
    case 'failed': return `<#${result.channelId}>에 올리지 못했어요 (${result.code}). ${result.code === 'discord_http_403' ? '봇에 그 채널의 보기·메시지 보내기 권한을 주세요.'
      : result.code === 'discord_http_404' ? '채널을 찾지 못했어요. 채널을 다시 정해 주세요.' : '잠시 후 다시 시도해 주세요.'} 다음 채팅 동기화 때도 다시 시도해요.`;
  }
}
