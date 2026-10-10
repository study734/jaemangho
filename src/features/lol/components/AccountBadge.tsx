'use client';

import { useEffect, useState } from 'react';
import { RankLabel } from './RankLabel';
import { useLol } from '../state/LolProvider';
import { createLolData, type Overview } from '../api/lolData';
import { createRiotClient } from '../api/riot';

const lol = createLolData(createRiotClient());

// 이미 불러온 티어를 재사용하고, 프로필 직접 진입 시 이 계정만 조회한다.
export function LolAccountBadge({ id, gameName, tagLine }: { id: string; gameName: string; tagLine: string }) {
  const loaded = useLol().members.find((x) => x.id === id);
  const [overview, setOverview] = useState<{ key: string; data: Overview } | null>(null);
  const key = `${gameName}#${tagLine}`;
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    lol.overview({ gameName, tagLine })
      .then(data => { if (!cancelled) setOverview({ key, data }); })
      .catch(() => {}); // 계정 이름은 Riot 장애에도 계속 표시한다.
    return () => { cancelled = true; };
  }, [loaded, gameName, tagLine, key]);
  const m = loaded ?? (overview?.key === key ? overview.data : null);
  const total = m ? m.wins + m.losses : 0;
  return (
    <span style={{ display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span>{gameName}#{tagLine}</span>
      {m && m.tier !== 'UNRANKED' && (
        <RankLabel tier={m.tier} rank={m.rank} style={{ fontWeight: 600, fontSize: '13px' }}>
          {' '}{m.leaguePoints}LP
          {total > 0 && <span style={{ color: 'var(--slate)', fontWeight: 400 }}> · {m.wins}승 {m.losses}패 ({Math.round((m.wins / total) * 100)}%)</span>}
        </RankLabel>
      )}
    </span>
  );
}
