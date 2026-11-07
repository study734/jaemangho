// 랭크 티어 정렬 순서·한글 이름·색. 화면 컴포넌트가 공통으로 쓴다.
export const getTierOrder = (tier: string): number => {
  const order: { [key: string]: number } = {
    'CHALLENGER': 10,
    'GRANDMASTER': 9,
    'MASTER': 8,
    'DIAMOND': 7,
    'EMERALD': 6,
    'PLATINUM': 5,
    'GOLD': 4,
    'SILVER': 3,
    'BRONZE': 2,
    'IRON': 1
  };
  return order[tier] || 0;
};

export const getRankOrder = (rank: string): number => {
  const order: { [key: string]: number } = {
    'I': 4,
    'II': 3,
    'III': 2,
    'IV': 1
  };
  return order[rank] || 0;
};

export const getTierLabelKR = (tier: string): string => {
  const label: { [key: string]: string } = {
    'CHALLENGER': '챌린저',
    'GRANDMASTER': '그랜드마스터',
    'MASTER': '마스터',
    'DIAMOND': '다이아몬드',
    'EMERALD': '에메랄드',
    'PLATINUM': '플래티넘',
    'GOLD': '골드',
    'SILVER': '실버',
    'BRONZE': '브론즈',
    'IRON': '아이언'
  };
  return label[tier] || tier;
};

export const getTierColor = (tier: string): string => {
  const colors: { [key: string]: string } = {
    'CHALLENGER': '#f48c06',
    'GRANDMASTER': '#d90429',
    'MASTER': '#c77dff',
    'DIAMOND': '#00b4d8',
    'EMERALD': '#00ed64',
    'PLATINUM': '#4ea8de',
    'GOLD': '#ffb703',
    'SILVER': '#adb5bd',
    'BRONZE': '#9d4edd',
    'IRON': '#6c757d'
  };
  return colors[tier] || '#ffffff';
};
