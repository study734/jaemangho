export function formatDuration(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
export function formatTimeAgo(timestamp: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
  if (minutes < 60) return minutes + '분 전';
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? hours + '시간 전' : Math.floor(hours / 24) + '일 전';
}
export function getKdaRatio(kills: number, deaths: number, assists: number): string {
  return deaths === 0 ? 'Perfect' : ((kills + assists) / deaths).toFixed(2);
}
