import { purgeRiotCache } from '../admin';
import { improvementReport } from '../improvements';
import { audited } from '../operations/audit';
import { chatConfigured, runChatSync, SyncBusyError } from '../operations/jobs';
import { checkOperations } from '../operations/monitor';
import { operationStatus } from '../operations/status';
import { purgeSteamCache } from '../steam/cache';
import { fit, label, privateMessage, SITE, type Message } from './protocol';
import { KIND_LABEL } from '../../lib/improvements';

// 관리자 전용 명령. 웹 /api/admin/operations와 같은 서비스와 작업 이력(audited)을 쓴다.
// 사용자 차단·해제, 소환사 삭제처럼 되돌리기 어려운 작업은 웹 관리자 화면에만 둔다.
export type AdminTask = '개선' | '상태' | '점검' | '동기화' | 'steam' | 'riot';
type Actor = { id: string; name: string };
const KST = { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;
const when = (value: unknown) => value ? new Date(value as string).toLocaleString('ko-KR', KST) : '없음';
// 디스코드 처리 예산(45초) 안에서 끝나도록 수동 동기화는 웹(50초)보다 짧게 끊고, 남은 부분은 다음 실행이 이어 받는다.
const SYNC_BUDGET_MS = 30_000;

export const ADMIN_DENIED = privateMessage('관리자만 실행할 수 있어요. 디스코드 Administrator 권한과 사이트 관리자 상태(로그인할 때 갱신)가 모두 필요해요.');

export async function adminTask(task: AdminTask, actor: Actor): Promise<Message> {
  switch (task) {
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
  const report = await improvementReport();
  const head = `📋 개선 우선순위 (최근 7일 열람 ${report.totalViews.current.toLocaleString('ko-KR')}회, 그 전 7일 ${report.totalViews.previous.toLocaleString('ko-KR')}회)`;
  if (!report.items.length) return privateMessage(`${head}\n지금 고칠 경고·실패가 없어요.${report.usageEnough ? '' : ' 열람이 적어 사용량 판단은 하지 않았어요.'}`);
  const lines = report.items.slice(0, 8).map((item, index) =>
    `${index + 1}. **[${KIND_LABEL[item.kind]}] ${label(item.target)}** — ${item.reasons.map(reason => label(reason, 200)).join(' / ')}${item.next ? `\n   다음: ${item.next}` : ''}`);
  return privateMessage(fit([head, ...lines, ...(report.usageEnough ? [] : ['열람이 적어 사용량 판단(살펴보기·키우기·정리 검토)은 하지 않았어요.']),
    `전체: ${SITE}/admin`].join('\n\n')));
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
    `자세히: ${SITE}/admin`,
  ].join('\n')));
}
