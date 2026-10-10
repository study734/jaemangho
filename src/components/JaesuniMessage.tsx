import type { ReactNode } from 'react';
import { VisualImage } from './VisualImage';

export function JaesuniAuthor({ className = '' }: { className?: string }) {
  return <p className={`dc-head ${className}`}><b>재순이</b><span className="dc-bot">앱</span></p>;
}

// 관리자가 제공하는 기능을 재순이의 채널 메시지로 표시한다. 전송 시각이나 대화 이력은 만들지 않는다.
export function JaesuniMessage({ line, children, className = '' }: { line: string; children: ReactNode; className?: string }) {
  return (
    <article className={`dc-message jaesuni-message ${className}`} aria-label="재순이의 기능 안내">
      <VisualImage src="/images/jaesuni-home.webp" alt="재순이 프로필" fallback="재" width={40} height={40} className="dc-avatar jaesuni-avatar" />
      <div className="dc-body">
        <JaesuniAuthor />
        <p className="dc-text">{line}</p>
        <div className="jaesuni-embed">{children}</div>
      </div>
    </article>
  );
}
