// 개념글 한 줄의 반응 표시: "🔥 8 · 💬 3" (반응이나 답글이 없으면 그 부분은 뺀다)
export function scoreLabel(topEmoji: string | null, reactions: number, replies: number) {
  return [reactions > 0 ? `${topEmoji ?? '👍'} ${reactions}` : null, replies > 0 ? `💬 ${replies}` : null].filter(Boolean).join(' · ') || '💬 0';
}
