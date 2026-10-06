// Data Dragon 정적 이미지 버전. 새 패치 이미지는 이 값 한 곳에서 갱신한다.
export const DATA_DRAGON_VERSION = '16.19.1';
export const RIOT_IMAGE_PLACEHOLDER = '/riot-image-placeholder.svg';
export type RiotImageKind = 'champion' | 'profileicon' | 'item';

export function riotImageUrl(kind: RiotImageKind, asset: string | number): string {
  if (!String(asset).trim() || asset === 'Unknown') return RIOT_IMAGE_PLACEHOLDER;
  return `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/${kind}/${encodeURIComponent(asset)}.png`;
}
