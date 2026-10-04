'use client';

import { summarizeRoster } from '../domain/summary';
import { useLol } from '../state/LolProvider';

// 홈 카드 안에 들어가는 롤 요약 (등록 소환사, 실시간 게임, 최고 티어)
export function LolHomeSummary() {
  const { members } = useLol();
  return (
    <>
      {summarizeRoster(members).map((row) => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{row.label}</span>
          <span style={{ color: row.tone === 'live' ? '#00ed64' : row.tone === 'highlight' ? '#ffb703' : '#ffffff', fontWeight: 600 }}>{row.value}</span>
        </div>
      ))}
      {members.filter((m) => m.activeGame).slice(0, 5).map((m) => (
        <div key={m.id} style={{ color: '#00ed64', fontSize: '13px' }}>
          ● {m.gameName} · {m.activeGame?.championName}
        </div>
      ))}
    </>
  );
}
