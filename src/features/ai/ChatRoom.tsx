'use client';

import Link from 'next/link';
import { useState } from 'react';

export function ChatRoom({ message }: { message: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <section className="chat-suspended" aria-labelledby="chat-title">
    <div className="chat-intro">
      <p className="chat-kicker">재망호의 막내 · 재순이</p>
      <h1 id="chat-title">재순이와 대화</h1>
      <div className="chat-unavailable" role="status">
        {!imageFailed && <img className="chat-unavailable-art" src="/images/jaesuni-resting.webp"
          alt="재망호 막내 재순이가 ‘현재 사용할 수 없어요’ 팻말을 들고 있는 모습" width={720} height={661}
          ref={node => { if (node?.complete && node.naturalWidth === 0) setImageFailed(true); }} onError={() => setImageFailed(true)} />}
        <div><strong>AI 대화 기능은 중단했어요</strong><p>{message}</p>
          <p>Steam 게임 찾기와 롤 전적은 계속 이용할 수 있어요.</p></div>
      </div>
      <nav className="chat-suspended-links" aria-label="계속 이용할 수 있는 기능">
        <Link className="btn btn-primary" href="/steam">Steam 게임 찾기</Link>
        <Link className="btn btn-secondary" href="/lol">롤 전적 보기</Link>
      </nav>
    </div>
  </section>;
}
