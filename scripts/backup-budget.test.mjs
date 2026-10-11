import { expect, it } from 'vitest';
import { backupBudget } from './backup-budget.mjs';

const metadata = artifacts => async () => Response.json({ total_count: artifacts.length, artifacts });
it('현재 산출물과 30일 백업 예상 용량을 함께 검사한다', async () => {
  const result = await backupBudget({ bytes: 10_000_000, fetchFn: metadata([{ name: 'playwright-report', size_in_bytes: 76_000_000 }]) });
  expect(result.projectedBytes).toBeLessThan(400_000_000);
  expect(result.usedBytes).toBe(76_000_000);
});
it('작은 첫 백업도 기존 산출물이 예산을 채웠으면 업로드하지 않는다', async () => {
  await expect(backupBudget({ bytes: 1000, fetchFn: metadata([{ name: 'playwright-report', size_in_bytes: 400_000_000 }]) })).rejects.toThrow('400 MB');
});
it('예전의 더 큰 백업 크기를 월 보관 예상에 반영한다', async () => {
  await expect(backupBudget({ bytes: 1000, fetchFn: metadata([{ name: 'production-backup-123', size_in_bytes: 14_000_000 }]) })).rejects.toThrow('400 MB');
});
it('큰 백업이나 API 조회 실패를 용량 확보로 오인하지 않는다', async () => {
  await expect(backupBudget({ bytes: 10_000_001, fetchFn: metadata([]) })).rejects.toThrow('10 MB');
  await expect(backupBudget({ bytes: 1000, fetchFn: async () => new Response(null, { status: 403 }) })).rejects.toThrow('inspection failed');
  await expect(backupBudget({ bytes: 1000, fetchFn: metadata([{ name: 'bad', size_in_bytes: '100' }]) })).rejects.toThrow('metadata invalid');
});
it('두 번째 메타데이터 페이지의 용량도 포함한다', async () => {
  const fetchFn = async url => Response.json({ total_count: 2, artifacts: [String(url).endsWith('page=1')
    ? { name: 'report-1', size_in_bytes: 200_000_000 } : { name: 'report-2', size_in_bytes: 200_000_000 }] });
  await expect(backupBudget({ bytes: 1000, fetchFn })).rejects.toThrow('400 MB');
});
