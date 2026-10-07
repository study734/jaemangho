import type { CSSProperties, ReactNode } from 'react';
import { getTierColor, getTierLabelKR } from '../mockData';
// 티어의 색과 최상위 티어의 랭크 생략 규칙을 모든 표시 UI에서 공유한다.
export function RankLabel({ tier, rank, style, children }: {
  tier: string;
  rank: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const apex = tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER';
  return <span style={{ ...style, color: getTierColor(tier) }}>{getTierLabelKR(tier)} {apex ? '' : rank}{children}</span>;
}
