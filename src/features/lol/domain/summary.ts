import type { Member } from '../types';

// 사이드바 요약 상자에 보여줄 항목. 화면 껍데기가 정한 모양(label/value/tone)에 구조적으로 맞춘다.
export interface SummaryRow {
  label: string;
  value: string;
  tone?: 'live' | 'highlight';
}

const TIER_PRIORITY = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'];

export function summarizeRoster(members: Member[]): SummaryRow[] {
  // 티어가 가장 높은 소환사 (같으면 앞선 항목). 알 수 없는 티어(UNRANKED 등)는 가장 낮게 본다.
  let top = members[0];
  let best = Infinity;
  for (const m of members) {
    const idx = TIER_PRIORITY.indexOf(m.tier);
    if (idx !== -1 && idx < best) {
      best = idx;
      top = m;
    }
  }

  return [
    { label: '등록 소환사', value: `${members.length}명` },
    { label: '전투 중 (실시간)', value: `${members.filter((m) => m.activeGame !== null).length}명`, tone: 'live' },
    { label: '대장 주주', value: top ? `${top.gameName} (${top.tier})` : '없음', tone: 'highlight' },
  ];
}
