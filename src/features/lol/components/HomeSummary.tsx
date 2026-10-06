'use client';

import { summarizeRoster } from '../domain/summary';
import { useLol } from '../state/LolProvider';
import { getTierLabelKR } from '../mockData';
import { VisualImage } from './VisualImage';

const EMBLEM_TIERS = new Set(['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER']);

// 홈 카드 안에 들어가는 롤 요약 (등록 소환사, 실시간 게임, 최고 티어)
export function LolHomeSummary() {
  const { members, isLoading, error } = useLol();
  return (
    <>
      <div className="home-lol-stats">{summarizeRoster(members).map((row) => (
        <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{row.label}</span>
          <span style={{ color: row.tone === 'live' ? 'var(--primary)' : row.tone === 'highlight' ? 'var(--accent-pink)' : 'var(--ink)', fontWeight: 600 }}>{row.value}</span>
        </div>
      ))}</div>
      {members.filter((m) => m.activeGame).slice(0, 5).map((m) => (
        <div key={m.id} style={{ color: 'var(--primary)', fontSize: '13px' }}>
          ● {m.gameName} · {m.activeGame?.championName}
        </div>
      ))}
      {isLoading && <p>소환사 현황을 불러오는 중이에요.</p>}
      {!isLoading && error && <p>현황을 불러오지 못했어요. 롤 화면에서 다시 확인해 주세요.</p>}
      {!isLoading && !error && members.length === 0 && <p>소환사를 등록하면 친구들의 랭크가 여기에 모여요.</p>}
      {members.length > 0 && (
        <div className="home-roster">
          <table aria-label="등록 소환사 랭크 요약">
            <thead><tr><th scope="col">소환사</th><th scope="col">티어</th><th scope="col">LP</th><th scope="col">승 / 패</th></tr></thead>
            <tbody>{members.slice(0, 4).map((m) => (
              <tr key={m.id}>
                <td title={`${m.gameName}#${m.tagLine}`}><span className="summoner-identity"><VisualImage src={`https://ddragon.leagueoflegends.com/cdn/16.19.1/img/profileicon/${m.profileIconId}.png`} fallback={m.gameName.slice(0, 1)} width={32} height={32} className="member-avatar" />{m.gameName}</span></td>
                <td><span className="summoner-identity">{EMBLEM_TIERS.has(m.tier) && <VisualImage src={`/images/ranks/${m.tier.toLowerCase()}.png`} width={32} height={36} className="rank-emblem" />}{m.tier === 'UNRANKED' ? '언랭크' : getTierLabelKR(m.tier)} {m.rank}</span></td><td>{m.leaguePoints}</td><td>{m.wins}승 {m.losses}패</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
