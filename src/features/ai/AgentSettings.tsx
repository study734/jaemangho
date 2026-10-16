'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useChat } from './ChatProvider';

interface Choices { steam: { ref: string; label: string }[]; lol: { ref: string; label: string }[] }

// The member legend is local UI data, never added to model messages.
export function AgentSettings() {
  const { model, selection, busy } = useChat();
  const [choices, setChoices] = useState<Choices | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai/settings', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('멤버와 취향을 불러오지 못했어요.');
      const body = await response.json();
      if (!Array.isArray(body.steam) || !Array.isArray(body.lol) || typeof body.note !== 'string') throw new Error('설정 응답을 읽지 못했어요.');
      if (!controller.signal.aborted) { setChoices(body); setNote(body.note); setSaved(body.note); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '설정을 불러오지 못했어요.'); });
    return () => controller.abort();
  }, [revision]);

  async function save(value: string) {
    if (saving) return;
    setSaving(true); setStatus(''); setError('');
    try {
      const response = await fetch('/api/ai/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: value }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '취향 저장에 실패했어요.');
      setNote(body.note); setSaved(body.note); setStatus(body.note ? '취향을 저장했어요. 다음 질문부터 참고해요.' : '저장한 취향을 지웠어요.');
    } catch (error) { setError(error instanceof Error ? error.message : '취향 저장에 실패했어요.'); }
    finally { setSaving(false); }
  }

  return <details className="agent-settings"><summary>멤버·취향 설정{selection.steam.length ? ` · Steam ${selection.steam.length}명` : ''}{selection.lol ? ' · LoL 1명' : ''}</summary>
    <p className="chat-muted">멤버를 고른 뒤 대화로 조회를 부탁해 주세요. 선택만으로는 AI를 호출하지 않아요.</p>
    {!choices && !error && <p role="status" className="chat-muted">설정을 불러오는 중…</p>}
    {choices && <>
      <fieldset disabled={busy}><legend>함께할 Steam 멤버</legend>
        {choices.steam.length ? choices.steam.map(member => <label key={member.ref}><input type="checkbox" checked={selection.steam.includes(member.ref)} disabled={!selection.steam.includes(member.ref) && selection.steam.length >= 20} onChange={event => model.setSelection({ ...selection, steam: event.target.checked ? [...selection.steam, member.ref] : selection.steam.filter(ref => ref !== member.ref) })} /><span>{member.label}</span></label>) : <p className="chat-muted">등록된 Steam 멤버가 없어요.</p>}
      </fieldset>
      <label className="agent-select-label" htmlFor="agent-lol">살펴볼 소환사</label><select id="agent-lol" className="text-input" disabled={busy} value={selection.lol ?? ''} onChange={event => model.setSelection({ ...selection, lol: event.target.value || null })}>
        <option value="">선택 안 함</option>{choices.lol.map(member => <option key={member.ref} value={member.ref}>{member.label}</option>)}
      </select>
      <form onSubmit={event => { event.preventDefault(); void save(note); }}>
        <label className="agent-select-label" htmlFor="agent-preference">재순이가 기억할 내 취향</label>
        <textarea id="agent-preference" className="text-input" rows={3} maxLength={400} value={note} disabled={saving || busy} onChange={event => setNote(event.target.value)} placeholder="예: 경쟁 게임보다 협동 게임을 좋아해." />
        <p className="chat-muted">저장 버튼을 누른 내용만 계정에 보관하고 NVIDIA에 전송해요. 개인정보·비밀값은 적지 마세요.</p>
        <p className="chat-muted">대화용 개인 메모예요. 공통 게임 추천에 사용할 취향은 <Link href="/steam#game-taste">게임 취향 설정</Link>에서 관리해요.</p>
        <div className="agent-settings-actions"><button className="btn btn-secondary" disabled={saving || busy || note.trim() === saved}>{saving ? '저장 중…' : '취향 저장'}</button>
          <button type="button" className="chat-text-button" disabled={saving || busy || !saved} onClick={() => void save('')}>기억 지우기</button></div>
      </form>
    </>}
    {status && <p className="chat-muted" role="status">{status}</p>}
    {error && <div role="alert"><p className="chat-muted">{error}</p>{!choices && <button type="button" className="chat-text-button" onClick={() => setRevision(value => value + 1)}>설정 다시 불러오기</button>}</div>}
  </details>;
}
