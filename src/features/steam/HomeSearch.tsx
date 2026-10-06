import { UiIcon, VisualImage } from './VisualImage';

const PICKS = [
  { id: 413150, name: 'Stardew Valley', description: '농장에 모여 느긋하게' },
  { id: 1966720, name: 'Lethal Company', description: '친구들과 아슬아슬한 협동' },
  { id: 105600, name: 'Terraria', description: '함께 탐험하고 만들어 보기' },
];

export function SteamHomeSearch() {
  return (
    <div className="steam-discovery">
      <form action="/steam" method="get" className="game-search" role="search" aria-label="함께 할 Steam 게임 찾기">
        <div className="game-search-field"><UiIcon name="search" />
          <input type="search" name="q" aria-label="찾을 Steam 게임 이름" placeholder="게임 이름으로 찾아보기" maxLength={120} />
        </div>
        <button className="btn btn-primary" type="submit">찾기<UiIcon name="arrow-right" /></button>
      </form>
      <p className="game-search-hint">함께할 멤버를 고른 뒤 공통 게임 결과에서 찾아요.</p>
      <div className="game-picks-heading"><span>오늘은 이런 게임 어때?</span><span>친구들과 즐기는 게임</span></div>
      <div className="game-cover-grid">
        {PICKS.map((game) => (
          <a key={game.id} href={`/steam?q=${encodeURIComponent(game.name)}`} className="game-cover-link">
            <VisualImage src={`/images/games/${game.id}.jpg`} width={460} height={215} alt={`${game.name} 표지`} fallback={game.name} className="game-cover" />
            <strong>{game.name}</strong><span>{game.description}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
