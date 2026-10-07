// 같은 후보를 연속으로 뽑지 않는다(2개 이상일 때). 필터로 보이는 실제 추천만 사용한다.
export function drawGame<T extends { appId: number }>(games: T[], previousId: number | null, roll: number): T | null {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('roll must be in [0, 1)');
  const pool = games.length > 1 ? games.filter(game => game.appId !== previousId) : games;
  return pool.length ? pool[Math.floor(roll * pool.length)] : null;
}
