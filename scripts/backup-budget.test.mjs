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
it('2026-11-27 운영 재현: total_count보다 1개 적게 내려와도 빠진 것을 큰 크기로 세고 계속한다', async () => {
  // GitHub가 total_count 46을 주면서 목록은 45개만 돌려줬다(마지막 페이지는 빈 배열). 예전에는 업로드를 멈췄다.
  const listed = [{ name: 'production-backup-1', size_in_bytes: 850_000 }];
  const fetchFn = async url => Response.json({ total_count: 2, artifacts: String(url).endsWith('page=1') ? listed : [] });
  const result = await backupBudget({ bytes: 850_000, fetchFn });
  expect(result.uncountedArtifacts).toBe(1);
  expect(result.usedBytes).toBe(850_000 + 10_000_000); // 빠진 1개는 백업 상한(10 MB)으로 센다
});
it('빠진 산출물이 많으면 여전히 조회 불완전으로 멈춘다', async () => {
  const fetchFn = async url => Response.json({ total_count: 10, artifacts: String(url).endsWith('page=1') ? [{ name: 'a', size_in_bytes: 1 }] : [] });
  await expect(backupBudget({ bytes: 1000, fetchFn })).rejects.toThrow('inspection incomplete');
});
it('여러 페이지가 모두 내려오면 빠진 수를 남기지 않는다', async () => {
  const fetchFn = async url => Response.json({ total_count: 101, artifacts: String(url).endsWith('page=1')
    ? Array.from({ length: 100 }, (_, i) => ({ name: `r-${i}`, size_in_bytes: 1 })) : [{ name: 'r-100', size_in_bytes: 1 }] });
  const result = await backupBudget({ bytes: 1000, fetchFn });
  expect(result.uncountedArtifacts).toBe(0);
  expect(result.usedBytes).toBe(101);
});
