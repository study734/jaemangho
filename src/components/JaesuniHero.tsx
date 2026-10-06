'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ServiceMark, UiIcon } from './VisualImage';

// 주요 행동과 인사는 이미지 밖에 둬 원화를 독립적으로 교체한다.
export function JaesuniHero({ name }: { name: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <header className={`jaesuni-hero${imageFailed ? ' jaesuni-without-art' : ''}`}>
      <div className="jaesuni-visual">
        {!imageFailed && <Image src="/images/jaesuni-home.webp" alt="게임패드를 든 재망호 막내 재순이" fill priority sizes="(max-width: 768px) 100vw, 1280px" className="jaesuni-art" onError={() => setImageFailed(true)} />}
        <div className="jaesuni-greeting"><p>왔네! 마침 보여줄 거 있었는데.</p><span>재순이 · 재망호 막내</span></div>
      </div>
      <div className="jaesuni-copy">
        <p className="home-eyebrow">우리들의 아지트 · JAEMANGHO</p>
        <h1>좋은 게임, 좋은 사람들<br />여전히 여기서, <span>재망호</span></h1>
        <p className="jaesuni-description">고등학교 때부터 지금까지.<br />게임도, 서브컬처도 언제나 함께하는 우리.</p>
        <p className="jaesuni-welcome">{name}님, 오늘은 뭘 같이 할까요?</p>
        <Link href="/steam" className="btn btn-primary"><ServiceMark service="steam" size={22} />같이 할 게임 찾기<UiIcon name="arrow-right" /></Link>
      </div>
    </header>
  );
}
