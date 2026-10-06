export interface AuditEntry {
  id: string;
  actorName: string;
  action: string;
  target: string;
  result: 'started' | 'success' | 'failed';
  createdAt: string;
}
export interface JobEntry {
  id: string;
  status: 'running' | 'success' | 'partial' | 'failed';
  source: 'scheduled' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  result: { channels: number; messages: number; rateLimited: boolean; warnings?: string[]; truncated?: boolean } | null;
  errorCode: string | null;
}
export interface OperationsData {
  jobs: JobEntry[];
  lastSuccess: string | null;
  alerts: { key: string; title: string; severity: string; active: boolean; firstSeen: string; resolvedAt: string | null; notificationError: string | null }[];
  checkedAt: string | null;
  audit: AuditEntry[];
  chatConfigured: boolean;
  notificationsConfigured: boolean;
  steam: {
    cache: { rows: number; fresh: number };
    stats: { day: string; hits: number; misses: number; errors: number }[];
    errors: { at: string; endpoint: string; code: string }[];
  };
}
export interface ViewReport {
  days: number;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  summary: { path: string; current: number; previous: number }[];
  daily: { day: string; views: number }[];
}
export const AUDIT_LABELS: Record<string, string> = {
  'user.block': '사용자 차단', 'user.unblock': '차단 해제', 'member.delete': '소환사 삭제',
  'cache.riot.purge': 'Riot 캐시 비우기', 'cache.steam.purge': 'Steam 캐시 비우기',
  'chat.sync': '채팅 동기화 재실행', 'monitor.check': '운영 상태 점검', 'snapshot.export': '운영 현황 내보내기',
};
