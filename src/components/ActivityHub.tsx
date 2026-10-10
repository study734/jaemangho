import Link from 'next/link';
import { ServiceMark, UiIcon } from './VisualImage';

const PLAY = [
  { href: '/steam', title: 'Steam 공통 게임', description: '함께할 멤버를 선택하고 보유 게임을 비교해요. 게임 검색과 무작위 뽑기도 여기서.', service: 'steam' as const },
  { href: '/steam', title: '우리의 공동 도전', description: '선택한 멤버의 게임과 업적을 확인하고 함께 도전할 목표를 찾아요.', service: 'steam' as const },
  { href: '/lol', title: 'LoL 전적과 랭크', description: '친구들의 최근 전적, 랭크와 게임 현황을 확인해요.', service: 'leagueoflegends' as const },
  { href: '/lol/synergy', title: '듀오 시너지', description: '친구와 함께한 경기 기록에서 듀오 성적을 비교해요.', service: 'leagueoflegends' as const },
];
const MEMORIES = [
  { href: '/community', title: '개념글 보관함', description: '반응과 받은 답글로 선정된 메시지. Discord 원문으로 그 순간을 다시 만나요.', service: 'discord' as const },
  { href: '/community', title: '뜨거웠던 순간', description: '10분 동안 3명 이상이 메시지 10개 이상을 남겼던 시간들을 돌아봐요.', service: 'discord' as const },
  { href: '/community/awards', title: '주간 시상식', description: '완료된 주의 실제 집계로 선정한 칭호와 수상자를 확인해요.', service: 'discord' as const },
  { href: '/people', title: '친구들이 모은 칭호', description: '멤버 프로필에서 연결된 게임 계정과 지금까지 받은 칭호를 살펴봐요.', service: null },
];

export function ActivityHub({ kind }: { kind: 'play' | 'memories' }) {
  const play = kind === 'play';
  return (
    <div className="activity-hub">
      <header className="hub-heading">
        <p className="home-eyebrow">{play ? '함께할 사람, 함께할 게임' : '우리만의 기록 · MEMORIES'}</p>
        <h1>{play ? '오늘은 뭐 하고 놀까?' : '함께한 순간을 다시 만나봐요'}</h1>
        <p>{play ? '게임을 고르고, 팀을 꾸리고, 함께할 도전을 찾아요.' : '새로운 이야기가 없어도, 우리가 남긴 기록은 여기 있어요.'}</p>
      </header>
      <div className="hub-grid">
        {(play ? PLAY : MEMORIES).map(item => (
          <Link key={item.title} href={item.href} className="hub-destination">
            {item.service ? <ServiceMark service={item.service} size={36} /> : <UiIcon name="people" size={36} />}
            <h2>{item.title}</h2><p>{item.description}</p><span>보러 가기 →</span>
          </Link>
        ))}
      </div>
      <p className="hub-note">{play ? '게임 보유 여부와 업적은 선택한 멤버의 조회 가능한 데이터로 확인해요.' : 'Discord 메시지 본문을 새로 수집하거나 해석하지 않아요. 원문은 Discord의 채널 접근 권한에 따라 볼 수 있어요.'}</p>
    </div>
  );
}
