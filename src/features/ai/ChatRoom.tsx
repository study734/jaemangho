'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useChat } from './ChatProvider';
import { AgentSettings } from './AgentSettings';
import { contextView } from './context-view';
import type { Attachment } from './model';

function JaesuniAvatar({ large = false }: { large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`chat-avatar${large ? ' chat-avatar-large' : ''}`}>
    {failed ? '재' : <img ref={node => { if (node?.complete && node.naturalWidth === 0) setFailed(true); }} src="/images/jaesuni-home.webp" alt="재망호 막내 재순이" width={large ? 72 : 40} height={large ? 72 : 40} onError={() => setFailed(true)} />}
  </span>;
}

function AttachmentLabel({ attachment }: { attachment: Attachment }) {
  const view = contextView(attachment.context);
  return <div className="chat-attachment-label"><span>{view.title}<small>{view.summary}</small></span></div>;
}

// unavailable: 서버에 AI 키가 없을 때. 입력은 그대로 두고(서버가 같은 안내로 답한다) 상단에 이유를 알린다.
export function ChatRoom({ unavailable = false }: { unavailable?: boolean }) {
  const { model, userName, messages, attachment, busy, error, draft } = useChat();
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialsHidden, setMaterialsHidden] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const material = attachment ?? [...messages].reverse().find(message => message.evidence)?.evidence ?? null;
  const view = material ? contextView(material.context) : null;
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy, error]);
  return <div className="chat-room">
    <section className="chat-conversation" aria-label="재순이와 개인 대화">
      <header className="chat-toolbar"><span className="chat-private">나만 보는 대화</span>
        <div><button type="button" className="chat-text-button chat-materials-desktop-toggle" aria-expanded={!materialsHidden} aria-controls="chat-materials" onClick={() => setMaterialsHidden(hidden => !hidden)}>참고 자료{material ? ' 1' : ''}</button><button type="button" className="chat-text-button chat-materials-mobile-toggle" aria-expanded={materialsOpen} aria-controls="chat-materials" onClick={() => setMaterialsOpen(open => !open)}>참고 자료{material ? ' 1' : ''}</button>
          <button type="button" className="chat-text-button" disabled={!messages.length && !attachment} onClick={() => setResetOpen(true)}>새 대화</button></div>
      </header>
      {resetOpen && <div className="chat-reset" role="group" aria-label="새 대화 확인"><p>현재 대화와 첨부 자료를 지울까요?</p><button type="button" className="btn btn-secondary" onClick={() => setResetOpen(false)}>계속 대화</button><button type="button" className="btn btn-primary" onClick={() => { model.reset(); setResetOpen(false); input.current?.focus(); }}>지우고 시작</button></div>}
      <div className="chat-timeline" role="log" aria-label="대화 내용" aria-relevant="additions">
        <div className={`chat-intro${messages.length ? ' chat-intro-compact' : ''}`}>
          <JaesuniAvatar large /><p className="chat-kicker">재망호의 막내 · AI</p><h1>재순이와 대화</h1>
          <p>오늘 같이 할 게임, 아쉬웠던 한 판.<br />무슨 이야기부터 할까?</p>
          {unavailable && <div className="chat-unavailable" role="status"><strong>재순이는 잠깐 쉬는 중이야</strong><p>대답하려면 API 키가 필요한데 아직 못 받았어… 관리자가 키를 챙겨 주면 바로 돌아올게! 그동안 Steam 게임 고르기나 전적은 평소처럼 볼 수 있어.</p></div>}
          {!messages.length && <div className="chat-starters" role="group" aria-label="대화 시작 예시">{['오늘 같이 할 게임 고르자', '최근 전적을 같이 보고 싶어', '재순이는 뭘 도와줘?'].map(prompt => <button type="button" key={prompt} onClick={() => { model.setDraft(prompt); input.current?.focus(); }}>{prompt}<img src="/ui/arrow-right.svg" width={16} height={16} alt="" /></button>)}</div>}
        </div>
        {messages.map((message, i) => <article key={i} className="chat-message" aria-label={message.role === 'user' ? '내 메시지' : '재순이 메시지'}>
          {message.role === 'assistant' ? <JaesuniAvatar /> : <span className="chat-avatar chat-user-avatar" aria-hidden="true">{userName.slice(0, 1)}</span>}
          <div className="chat-message-body"><div className="chat-message-author">{message.role === 'user' ? userName : '재순이'}{message.role === 'assistant' && <span className="chat-ai-badge">AI</span>}</div>
            {message.attachment && <AttachmentLabel attachment={message.attachment} />}
            <div className="chat-message-copy">{message.content.split(/\n\s*\n/).map((paragraph, j) => <p key={j}>{paragraph}</p>)}</div>
            {message.toolsUsed?.map(label => <p key={label} className="chat-tool-label">{label}</p>)}
            {message.evidence && <details className="chat-inline-evidence"><summary>조회한 자료 보기</summary><AttachmentLabel attachment={message.evidence} /></details>}
            {message.truncated && <p className="chat-muted">응답 길이 제한으로 일부가 잘렸어요. 이어서 설명해 달라고 요청해 주세요.</p>}
          </div>
        </article>)}
        {busy && <div className="chat-message" role="status"><JaesuniAvatar /><div><div className="chat-message-author">재순이<span className="chat-ai-badge">AI</span></div><p className="chat-muted">답장을 생각하고 있어…</p></div></div>}
        {error && <div className="chat-failure" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary" onClick={() => void model.retry()}>답변 다시 받기</button><button type="button" className="btn btn-secondary" onClick={() => { model.editFailed(); input.current?.focus(); }}>질문 고치기</button><p className="chat-muted">재시도는 같은 질문과 당시 자료로 요청해요.</p></div>}
        <div ref={end} />
      </div>
      <div className="chat-input-area">
        {attachment && <div className="chat-current-attachment"><AttachmentLabel attachment={attachment} /><button type="button" className="chat-text-button" onClick={() => model.detach()}>첨부 해제</button></div>}
        <form className="chat-composer" onSubmit={event => { event.preventDefault(); void model.send(); input.current?.focus(); }}>
          <label className="sr-only" htmlFor="chat-input">재순이에게 메시지</label>
          <textarea ref={input} id="chat-input" rows={2} maxLength={600} placeholder="재순이에게 메시지 보내기" value={draft} disabled={busy || !!error}
            onChange={event => model.setDraft(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !error) void model.send(); }
            }} />
          <button className="btn btn-primary" aria-label="메시지 보내기" disabled={busy || !!error || !draft.trim()}><img src="/ui/arrow-right.svg" width={20} height={20} alt="" /></button>
        </form>
        <p className="chat-footnote">AI 답변 · 새로고침하면 대화 초기화 · 최근 대화 최대 4턴 참고</p>
        <details className="chat-disclosure"><summary>NVIDIA 전송·보관 안내</summary><p>보낸 질문·최근 대화·저장한 취향·첨부 및 조회 자료를 NVIDIA에 전송해요. 개인정보·비밀값을 적지 마세요. 자료에서는 닉네임·계정 ID·디스코드 원문을 제외해요. 대화는 현재 탭 메모리에만 유지해요. 취향은 저장 버튼으로만 DB에 보관해요. 서버는 성공한 답변을 5분간 임시 보관해요. 긴 대화·자료는 최근 4턴보다 적게 참고할 수 있어요.</p></details>
      </div>
    </section>
    <aside id="chat-materials" className="chat-materials" data-open={materialsOpen} data-hidden={materialsHidden} aria-label="현재 참고 자료">
      <div className="chat-materials-heading"><h2>현재 참고 자료</h2><button type="button" className="chat-text-button" onClick={() => setMaterialsOpen(false)}>닫기</button></div>
      <AgentSettings />
      {material && view ? <><AttachmentLabel attachment={material} /><p className="chat-muted">{new Date(material.capturedAt).toLocaleString('ko-KR')}의 자료예요. 원본 변경은 자동 반영하지 않아요.</p>
        {view.warning && <p className="chat-materials-warning">{view.warning}</p>}
        <ul className="chat-source-list">{view.items.map((item, i) => <li key={i}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul>
        <Link href={view.href} className="chat-source-link">원래 화면에서 확인하기<img src="/ui/arrow-right.svg" width={16} height={16} alt="" /></Link>
      </> : <><p className="chat-materials-empty">지금은 첨부된 자료가 없어.</p><p className="chat-muted">게임이나 전적 화면에서 자료를 붙이면 같이 보면서 이야기할 수 있어.</p><Link className="chat-source-link" href="/steam">Steam 게임 고르기<img src="/ui/arrow-right.svg" width={16} height={16} alt="" /></Link><Link className="chat-source-link" href="/lol">LoL 전적 보기<img src="/ui/arrow-right.svg" width={16} height={16} alt="" /></Link></>}
      <div className="chat-about"><strong>재순이</strong><span className="chat-ai-badge">AI</span><p>재망호의 막내. 게임 고를 때도, 기록이 궁금할 때도 편하게 말 걸어 줘.</p><small>부탁한 자료는 허용된 조회 도구로 확인해요. AI의 제안은 실제 기록과 함께 확인해 주세요.</small></div>
    </aside>
  </div>;
}
