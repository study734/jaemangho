'use client';

import { useRouter } from 'next/navigation';
import { useChat } from './ChatProvider';
import { contextView } from './context-view';

// Hand off a frozen snapshot without making a provider request.
export function AiPanel({ context }: { context: Record<string, unknown> }) {
  const { model } = useChat();
  const router = useRouter();
  const general = context.topic === 'general';
  return <section className="ai-handoff" aria-label="재순이와 대화 연결">
    <div><strong>{general ? '재순이와 이야기하기' : '이 자료, 재순이랑 같이 볼까?'}</strong>
      <p>{general ? '게임 고르기부터 기록 이야기까지, 나만 보는 대화방에서.' : `${contextView(context).summary} · 첨부 당시의 자료로 대화를 이어가요.`}</p></div>
    <button type="button" className="btn btn-secondary" onClick={() => {
      if (!general) model.attach(context);
      router.push('/chat');
    }}>{general ? '대화방 열기' : '자료 붙여서 대화하기'}<img src="/ui/arrow-right.svg" width={16} height={16} alt="" /></button>
  </section>;
}
