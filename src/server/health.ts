import { pool } from './pool';

// 배포 확인용. 외부에 알려주는 것은 "살아 있는가" 하나뿐이다 (오류 내용은 응답에 넣지 않는다).
export async function checkHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
