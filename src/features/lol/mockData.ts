import type { Member } from './types';

// Champions list (kept for mapping/UI helpers if needed)
export const CHAMPIONS = [
  'Aatrox', 'Ahri', 'Akali', 'Alistar', 'Amumu', 'Anivia', 'Annie', 'Aphelios', 'Ashe', 'AurelionSol',
  'Azir', 'Bard', 'BelVeth', 'Blitzcrank', 'Brand', 'Braum', 'Briar', 'Caitlyn', 'Camille', 'Cassiopeia',
  'ChoGath', 'Corki', 'Darius', 'Diana', 'DrMundo', 'Draven', 'Ekko', 'Elise', 'Evelynn', 'Ezreal',
  'Fiddlesticks', 'Fiora', 'Fizz', 'Galio', 'Gangplank', 'Garen', 'Gnar', 'Gragas', 'Graves', 'Gwen',
  'Hecarim', 'Heimerdinger', 'Hwei', 'Illaoi', 'Irelia', 'Ivern', 'Janna', 'JarvanIV', 'Jax', 'Jayce',
  'Jhin', 'Jinx', 'Kaisa', 'Kalista', 'Karma', 'Karthus', 'Kassadin', 'Katarina', 'Kayle', 'Kayn',
  'Kennen', 'Khazix', 'Kindred', 'Kled', 'KogMaw', 'Leblanc', 'LeeSin', 'Leona', 'Lillia', 'Lissandra',
  'Lucian', 'Lulu', 'Lux', 'Malphite', 'Malzahar', 'Maokai', 'MasterYi', 'Milio', 'MissFortune', 'Mordekaiser',
  'Morgana', 'Naafiri', 'Nami', 'Nasus', 'Nautilus', 'Neeko', 'Nidalee', 'Nilah', 'Nocturne', 'Nunu',
  'Olaf', 'Orianna', 'Ornn', 'Pantheon', 'Poppy', 'Pyke', 'Qiyana', 'Quinn', 'Rakan', 'Rammus',
  'RekSai', 'Rell', 'Renata', 'Renekton', 'Rengar', 'Riven', 'Rumble', 'Ryze', 'Samira', 'Sejuani',
  'Senna', 'Seraphine', 'Sett', 'Shaco', 'Shen', 'Shyvana', 'Singed', 'Sion', 'Sivir', 'Skarner',
  'Sona', 'Soraka', 'Swain', 'Sylas', 'Syndra', 'TahmKench', 'Taliyah', 'Talon', 'Taric', 'Teemo',
  'Thresh', 'Tristana', 'Trundle', 'Tryndamere', 'TwistedFate', 'Twitch', 'Udyr', 'Urgot', 'Varus', 'Vayne',
  'Veigar', 'VelKoz', 'Vex', 'Vi', 'Viego', 'Viktor', 'Vladimir', 'Volibear', 'Warwick', 'Wukong',
  'Xayah', 'Xerath', 'XinZhao', 'Yasuo', 'Yone', 'Yorick', 'Yuumi', 'Zac', 'Zed', 'Zeri',
  'Ziggs', 'Zilean', 'Zoe', 'Zyra'
];

// CLEAN INITIAL SQUAD (Empty array for pure real-time custom crew setup)
export const INITIAL_MEMBERS: Member[] = [];

// Helper map tiers to rank power (for sorting)
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
