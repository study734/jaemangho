import { expect, it } from 'vitest';
import { backupFailure } from './backup-cycle.mjs';

it('실패 단계와 SQLSTATE만 공개하고 URL·비밀번호·개인 데이터는 숨긴다', () => {
  const error = Object.assign(new Error('postgres://private-user:private-password@private-host/db'), {
    stage: 'source_dump', code: '42501', detail: 'private data', password: 'private-password',
  });
  const result = backupFailure(error);
  expect(result).toEqual({ stage: 'source_dump', sqlState: '42501' });
  expect(JSON.stringify(result)).not.toContain('private');
});

it('외부 오류가 단계·코드 필드에 넣은 임의 문자열도 출력하지 않는다', () => {
  expect(backupFailure({ stage: 'https://secret.example/token', code: 'password' })).toEqual({ stage: 'configuration' });
});
