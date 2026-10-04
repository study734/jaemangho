'use client';

import { getTierColor, getTierLabelKR } from '../mockData';
import { useLol } from '../state/LolProvider';

// 프로필 등 다른 화면에 놓는 롤 계정 한 줄: 소환사명, 티어, 승률. 티어는 롤 화면이 이미 불러온 값을 쓴다.
export function LolAccountBadge({ id, gameName, tagLine }: { id: string; gameName: string; tagLine: string }) {
  const m = useLol().members.find((x) => x.id === id);
  const apex = m?.tier === 'MASTER' || m?.tier === 'GRANDMASTER' || m?.tier === 'CHALLENGER';
  const total = m ? m.wins + m.losses : 0;
  return (
    <span style={{ display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span>{gameName}#{tagLine}</span>
      {m && m.tier !== 'UNRANKED' && (
        <span style={{ color: getTierColor(m.tier), fontWeight: 600, fontSize: '13px' }}>
          {getTierLabelKR(m.tier)} {apex ? '' : m.rank} {m.leaguePoints}LP
          {total > 0 && <span style={{ color: '#a8b3bc', fontWeight: 400 }}> · {m.wins}승 {m.losses}패 ({Math.round((m.wins / total) * 100)}%)</span>}
        </span>
      )}
    </span>
  );
}
