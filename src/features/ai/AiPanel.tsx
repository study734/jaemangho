'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { createAnalysisModel } from './model';

// The app keys this panel by its context so changed selections cannot show an
// answer for an earlier set of players/games. No automatic provider calls.
export function AiPanel({ context }: { context: Record<string, unknown> }) {
  const [model] = useState(() => createAnalysisModel(context));
  const { busy, result, error } = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getServerSnapshot);
  const [question, setQuestion] = useState('');
  const id = useId();
  useEffect(() => () => model.cancel(), [model]);
  return <section style={styles.panel} aria-label="재순이 AI 해설" aria-busy={busy}>
    <p style={styles.hint}>{context.topic === 'general' ? '일반 질문을 NVIDIA에 보내 답변을 받아요. 다른 화면의 개인 기록을 자동으로 조회하지 않아요.'
      : '현재 화면의 게임 데이터와 집계를 NVIDIA에 보내 AI 해설을 받아요. 닉네임·계정 ID·대화 원문은 분석 자료에서 제외해요.'}</p>
    <button className="btn btn-secondary" disabled={busy} onClick={() => void model.run()}>{busy ? '재순이가 분석하는 중…' : '재순이 AI 해설 보기'}</button>
    <details>
      <summary style={styles.summary}>재순이에게 질문하기</summary>
      <form style={styles.form} onSubmit={event => { event.preventDefault(); if (question.trim()) void model.run(question); }}>
        <label htmlFor={id}>현재 자료에 관해 질문</label>
        <textarea id={id} className="text-input" style={styles.input} value={question} onChange={event => setQuestion(event.target.value)}
          maxLength={600} rows={3} disabled={busy} aria-describedby={`${id}-notice`} />
        <p id={`${id}-notice`} style={styles.hint}>질문 내용도 전송돼요. 이름·개인정보·비밀값은 적지 마세요. 대화 이력은 저장하지 않고, 성공한 답변은 서버 메모리에서 5분간 재사용해요.</p>
        <button className="btn btn-primary" disabled={busy || !question.trim()}>재순이에게 질문 보내기</button>
      </form>
    </details>
    {busy && <p role="status" style={styles.hint}>분석을 기다리는 동안 기존 기능을 계속 사용할 수 있어요.</p>}
    {error && <p role="alert" style={styles.hint}>{error}</p>}
    {result && <div role="status" style={styles.answer}><p style={styles.hint}>AI 해설 · 실제 기록과 다를 수 있어요.</p><p>{result.answer}</p>
      {result.truncated && <p style={styles.hint}>응답 길이 제한으로 일부가 잘렸어요. 질문 범위를 좁혀 다시 요청해 주세요.</p>}</div>}
  </section>;
}

const styles = {
  panel: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 12, minWidth: 0 },
  hint: { color: 'var(--slate)', fontSize: 13, lineHeight: 1.6 },
  summary: { color: 'var(--primary)', cursor: 'pointer', padding: '12px 0', minHeight: 44 },
  form: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 12, paddingTop: 12 },
  input: { width: '100%', minWidth: 0, resize: 'vertical' as const },
  answer: { color: 'var(--ink)', whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, lineHeight: 1.7, width: '100%' },
};
