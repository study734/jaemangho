'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createAnalysisModel } from './model';

const prompts = {
  steam: [
    { label: '어떤 게임부터 할까?', question: '현재 후보에서 먼저 해 볼 게임과 선택 이유를 설명해 줘.' },
    { label: '경험 차이는 어때?', question: '확인된 플레이 경험과 보유 인원으로 후보를 비교해 줘. 알 수 없는 점도 알려 줘.' },
  ],
  lol: [
    { label: '전적에서 눈에 띄는 점', question: '현재 불러온 전적에서 눈에 띄는 특징과 표본의 한계를 설명해 줘.' },
    { label: '다음 연습 방향', question: '현재 챔피언과 경기 수치를 근거로 다음 연습 방향을 제안해 줘.' },
  ],
  activity: [
    { label: '이 기록의 핵심은?', question: '표시된 기록에서 눈에 띄는 수치와 그 의미를 간단히 설명해 줘.' },
    { label: '이 기록의 한계는?', question: '이 집계로 알 수 있는 것과 알 수 없는 것을 구분해 줘.' },
  ],
  general: [
    { label: '오늘 같이 놀 게임 고르기', question: '친구들과 오늘 같이 할 게임을 고를 때 확인하면 좋은 기준을 알려 줘.' },
    { label: '재순이는 뭘 도와줘?', question: '재망호에서 어떤 자료를 바탕으로 도움받을 수 있는지 알려 줘.' },
  ],
};

function presentation(context: Record<string, unknown>): { topic: keyof typeof prompts; title: string; subtitle: string; source: string; action: string } {
  const topic = context.topic === 'steam' || context.topic === 'lol' || context.topic === 'activity' ? context.topic : 'general';
  if (topic === 'steam') return { topic, title: '오늘의 게임, 재순이의 픽', subtitle: '후보를 비교하고 함께할 게임을 고르는 힌트를 정리해.',
    source: `Steam · ${Array.isArray(context.games) ? context.games.length : 0}개 후보`, action: '후보 정리해 줘' };
  if (topic === 'lol') return { topic, title: '전적 사이에서 찾은 힌트', subtitle: '불러온 기록을 바탕으로 특징과 다음 연습 방향을 짚어줘.',
    source: `LoL · ${Array.isArray(context.players) ? context.players.length : 0}명 기록`, action: '전적 정리해 줘' };
  if (topic === 'activity') return { topic, title: context.period === 'awards' ? '이번 칭호에 담긴 기록' : '함께한 기록, 한눈에',
    subtitle: '숫자로 남은 우리 기록에서 눈에 띄는 부분을 정리해.', source: context.period === 'awards' ? '주간 시상식' : '이 화면의 활동 기록', action: '기록 정리해 줘' };
  return { topic, title: '궁금한 건 재순이에게', subtitle: '함께 놀 게임부터 기록을 읽는 방법까지, 편하게 물어봐.', source: '일반 질문 · 개인 기록 자동 조회 없음', action: '도움말 보기' };
}

// Keyed by context in the app. Changed selections discard the previous answer;
// expanding the composer or selecting a suggestion never calls the provider.
export function AiPanel({ context }: { context: Record<string, unknown> }) {
  const [model] = useState(() => createAnalysisModel(context));
  const { busy, result, error } = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getServerSnapshot);
  const [question, setQuestion] = useState('');
  const [composerOpen, setComposerOpen] = useState(context.topic === 'general');
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const view = presentation(context);
  useEffect(() => () => model.cancel(), [model]);
  useEffect(() => { if (composerOpen && context.topic !== 'general') input.current?.focus(); }, [composerOpen, context.topic]);

  return <section className="ai-panel" aria-label="재순이 AI 해설" aria-busy={busy}>
    <header className="ai-heading">
      <div className="ai-heading-copy">
        <p className="ai-eyebrow"><img src="/ui/star.svg" width={16} height={16} alt="" />재순이의 시선<span className="ai-badge">AI</span></p>
        <h3 style={styles.title}>{view.title}</h3>
        <p style={styles.subtitle}>{view.subtitle}</p>
      </div>
      {view.topic !== 'general' && <button className="btn btn-primary ai-summary-action" disabled={busy} aria-label={busy ? '재순이가 분석하는 중' : '재순이 AI 해설 보기'} onClick={() => void model.run()}>
        {busy ? '정리하는 중…' : view.action}<img src="/ui/arrow-right.svg" width={16} height={16} alt="" />
      </button>}
    </header>

    {!result && !busy && <div className="ai-suggestions" role="group" aria-label="질문 예시">
      {prompts[view.topic].map(prompt => <button key={prompt.label} type="button" className="ai-prompt" onClick={() => {
        setQuestion(prompt.question); setComposerOpen(true); input.current?.focus();
      }}>{prompt.label}<img src="/ui/arrow-right.svg" width={14} height={14} alt="" /></button>)}
    </div>}

    <div className="ai-context-line"><span className="ai-source">{view.source}</span><span>닉네임·계정 ID 제외</span></div>
    <div className="ai-content">
      {busy && <div className="ai-progress" role="status"><span className="pulse-indicator" aria-hidden="true" /><div><strong>재순이가 기록을 읽고 있어</strong><p>잠깐만 기다려 줘. 다른 기능은 계속 사용할 수 있어.</p></div></div>}
      {error && <div className="ai-error" role="alert"><img src="/ui/exclamation-triangle.svg" width={18} height={18} alt="" /><p>{error}</p></div>}
      {result && <div className="ai-answer" role="status">
        <div className="ai-answer-label"><span>재순이의 답변</span><span className="ai-badge">AI 해설</span></div>
        <div className="ai-answer-copy">{result.answer.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
        <p className="ai-answer-note">AI가 제안한 해석이야. 실제 기록과 함께 확인해 줘.</p>
        {result.truncated && <p className="ai-answer-note">응답 길이 제한으로 일부가 잘렸어요. 질문 범위를 좁혀 다시 요청해 주세요.</p>}
      </div>}

      <button type="button" className="ai-question-toggle" aria-expanded={composerOpen} aria-controls={`${id}-composer`}
        onClick={() => setComposerOpen(open => !open)}><span>재순이에게 질문하기</span><img src="/ui/arrow-right.svg" width={14} height={14} alt="" className="ai-toggle-icon" data-open={composerOpen} /></button>
      {composerOpen && <form id={`${id}-composer`} className="ai-composer" onSubmit={event => {
        event.preventDefault(); if (question.trim()) void model.run(question);
      }}>
        <label htmlFor={id} className="ai-input-label">현재 자료에 관해 질문</label>
        <textarea ref={input} id={id} className="text-input ai-question-input" value={question} onChange={event => setQuestion(event.target.value)}
          placeholder={view.topic === 'general' ? '재순이에게 궁금한 걸 적어 줘.' : '이 기록에서 더 궁금한 게 있어?'}
          maxLength={600} rows={3} disabled={busy} aria-describedby={`${id}-notice`} />
        <div className="ai-composer-actions"><p id={`${id}-notice`}>질문도 NVIDIA로 전송돼요. 개인정보·비밀값은 적지 마세요.</p>
          <button className="btn btn-primary" aria-label="재순이에게 질문 보내기" disabled={busy || !question.trim()}>질문 보내기<img src="/ui/arrow-right.svg" width={16} height={16} alt="" /></button>
        </div>
      </form>}
    </div>

    <details className="ai-disclosure"><summary>NVIDIA AI 사용 · 전송 안내</summary>
      <div><p>{view.topic === 'general' ? '일반 질문을 NVIDIA에 보내 답변을 받아요. 다른 화면의 개인 기록을 자동으로 조회하지 않아요.'
        : '현재 화면의 게임 데이터와 집계를 NVIDIA에 보내 AI 해설을 받아요. 닉네임·계정 ID·원문 링크·디스코드 대화 원문은 분석 자료에서 제외해요.'}</p>
        <p>질문에 적은 내용도 전송돼요. 대화 이력은 저장하지 않고, 성공한 답변은 서버 메모리에서 5분간 재사용해요.</p></div>
    </details>
  </section>;
}

const styles = {
  title: { fontSize: 'clamp(18px, 2vw, 20px)', fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.4, color: 'var(--ink)' },
  subtitle: { color: 'var(--slate)', fontSize: 14, lineHeight: 1.6, marginTop: 6 },
};
