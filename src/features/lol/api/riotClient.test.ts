import { afterEach, describe, expect, it, vi } from 'vitest';
import { riotClient, riotErrorMessage, riotGet } from './riotClient';

afterEach(() => vi.restoreAllMocks());

describe('Riot 오류 안내', () => {
  it('401의 원인을 키 오류로 단정하지 않고 인증 재확인을 안내한다', () => {
    const error = { response: { status: 401 } };
    expect(riotErrorMessage(error)).toContain('다시 로그인');
    expect(riotErrorMessage(new Error('wrapper', { cause: error }))).toBe(riotErrorMessage(error));
  });
  it('요청 제한과 연결 실패에 재시도 안내를 제공한다', () => {
    expect(riotErrorMessage({ response: { status: 429 } })).toContain('잠시 후');
    expect(riotErrorMessage(null)).toContain('네트워크');
  });
});

describe('진행 중인 Riot 요청 공유', () => {
  it('동일 요청 3개는 실제 호출 1개를 공유하고 완료 후에는 다시 조회한다', async () => {
    const get = vi.spyOn(riotClient, 'get').mockResolvedValue({ data: { ok: true } });
    const results = await Promise.all([riotGet('/same'), riotGet('/same'), riotGet('/same')]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    await riotGet('/same');
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('실패한 요청은 보관하지 않고 재시도하며 다른 URL은 독립적으로 실행한다', async () => {
    const get = vi.spyOn(riotClient, 'get').mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValue({ data: [] });
    await expect(riotGet('/retry')).rejects.toThrow('HTTP 429');
    await Promise.all([riotGet('/retry'), riotGet('/other')]);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
