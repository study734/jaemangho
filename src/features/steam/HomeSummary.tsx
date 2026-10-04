'use client';

import { useEffect, useState } from 'react';
import { steamApi } from './api';

// 홈 카드 안에 들어가는 Steam 요약. 실패해도 홈 전체는 그대로 보인다.
export function SteamHomeSummary() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    steamApi.list().then((m) => setCount(m.length), () => setCount(null));
  }, []);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>등록된 사람</span>
        <span style={{ color: '#ffffff', fontWeight: 600 }}>{count === null ? '-' : `${count}명`}</span>
      </div>
      <span>같이 할 사람을 고르면 모두가 가진 게임을 찾아 줍니다.</span>
    </>
  );
}
