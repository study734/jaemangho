export function contextView(context: Record<string, unknown>) {
  if (context.topic === 'steam') return {
    title: '함께할 Steam 게임', href: '/steam',
    summary: `${context.people}명 선택 · ${Array.isArray(context.games) ? context.games.length : 0}개 후보`,
    warning: Number(context.excluded) + Number(context.unverified) + Number(context.recentUnavailable) > 0 ? '일부 보유 목록·최근 기록을 확인하지 못했어요.' : '',
    items: (Array.isArray(context.games) ? context.games : []).map((game: { name: string; owners?: number; totalMinutes: number }) => ({
      title: game.name, detail: `${game.owners === undefined ? '보유 인원 집계 없음' : `${game.owners}명 보유`} · 합계 ${Math.round(game.totalMinutes / 60)}시간`,
    })),
  };
  if (context.topic === 'lol') {
    const players = (Array.isArray(context.players) ? context.players : []) as { player: number; tier: string; detailsLoaded: boolean; detailsUnavailable: boolean; matches: unknown[] }[];
    return { title: '불러온 LoL 전적', href: context.view === 'overview' ? '/lol' : `/lol/${context.view}`,
      summary: `${players.length}명 · 플레이어 번호로 전송`,
      warning: players.some(player => !player.detailsLoaded || player.detailsUnavailable) ? '상세 미조회·조회 실패가 포함돼요. 화면에 불러온 표본만 참고해요.' : '최근 표본이며 전체 전적이 아니에요.',
      items: players.map(player => ({ title: `플레이어 ${player.player}`, detail: `${player.tier} · ${player.matches.length}경기 표본` })),
    };
  }
  return { title: context.period === 'awards' ? '주간 시상식 기록' : '함께한 활동 기록', href: context.period === 'awards' ? '/community/awards' : '/community',
    summary: '반응·답글·활동 집계', warning: context.unavailable ? '일부 기록을 불러오지 못했어요.' : '디스코드 대화 원문은 포함하지 않아요.',
    items: [{ title: '표시된 기록', detail: `개념글 ${Array.isArray(context.highlights) ? context.highlights.length : 0}개 · 활동 구간 ${Array.isArray(context.moments) ? context.moments.length : 0}개 · 칭호 ${Array.isArray(context.awards) ? context.awards.length : 0}개` }],
  };
}
