'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ActivitySettings as Settings, steamApi, steamErrorMessage } from './api';

export function SteamActivitySettings({ linkResult }: { linkResult?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const actionPending = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setSettings(await steamApi.activity()); setError(null); }
    catch (e) { setError(steamErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const action = async (work: () => Promise<unknown>, success: string) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true); setError(null); setMessage(null);
    try { await work(); await load(); setMessage(success); }
    catch (e) { setError(steamErrorMessage(e)); }
    finally { actionPending.current = false; setBusy(false); }
  };
  const linkMessage = linkResult === 'verified' ? 'Steam 계정을 확인했습니다. 동의한 내 계정의 기록 준비를 시작해요.'
    : linkResult === 'already-linked' ? '이 Steam 계정은 다른 사용자에게 이미 확인돼 있습니다.'
      : linkResult === 'failed' ? 'Steam 계정 확인에 실패했습니다. 다시 시도해 주세요.' : null;

  return <section style={styles.panel} aria-labelledby="steam-activity-heading">
    <div style={styles.head}>
      <div><h3 id="steam-activity-heading" className="heading-4">내 Steam 기록 관리</h3><p style={styles.hint}>확인된 내 계정의 기록을 미리 준비해 공통 추천에 사용해요. 중단하면 저장 기록의 추천 이용도 멈춰요.</p></div>
      <a className="btn btn-secondary" href="/api/steam/activity/start">Steam 계정 확인</a>
    </div>
    {(linkMessage || message) && <p role="status" style={styles.hint}>{message ?? linkMessage}</p>}
    {error && <div role="alert"><p style={styles.warning}>{error}</p><button className="btn btn-secondary" disabled={loading || busy} onClick={() => void load()}>설정 다시 불러오기</button></div>}
    {loading && <p style={styles.hint}>기록 상태를 불러오는 중입니다.</p>}
    {!loading && settings && <>
      {settings.accounts.length === 0 && <p style={styles.hint}>확인된 Steam 계정이 없습니다. 위 버튼에서 본인 계정을 확인할 수 있습니다.</p>}
      <ul style={styles.list}>{settings.accounts.map((account) => {
        const active = !!account.requestedAt && !account.stoppedAt && account.noticeVersion === settings.noticeVersion;
        return <li key={account.steamId} style={styles.row}>
          <div style={styles.account}>
            <strong>{account.name}</strong><span style={styles.hint}>{account.steamId}</span>
            <span style={styles.hint}>{active ? '활동 기록 준비 요청됨' : account.stoppedAt ? '수집 중단됨' : account.requestedAt ? '새 안내 확인·동의 필요' : '수집 요청 전'}
              {account.lastSuccessAt ? ` · 마지막 성공 ${new Date(account.lastSuccessAt).toLocaleDateString('ko-KR')}` : ''}</span>
            {account.lastResult === 'unavailable' && <span style={styles.warning}>게임 목록을 확인할 수 없어요. Steam 게임 세부 정보 공개 여부를 확인해 주세요.</span>}
            {account.lastResult === 'error' && <span style={styles.warning}>기록 준비에 실패했어요. 15분 이후 다시 방문하면 재시도해요.</span>}
          </div>
          <div style={styles.actions}>
            {!active && settings.storageCountry && <button className="btn btn-primary" disabled={busy}
              onClick={() => void action(() => steamApi.requestActivity(account.steamId, settings.noticeVersion), '동의를 저장했어요. 활동 기록을 준비하고 있습니다.')}>기록 수집 재개</button>}
            {active && <button className="btn btn-secondary" disabled={busy}
              onClick={() => void action(() => steamApi.stopActivity(account.steamId), '활동 기록 수집을 중단했습니다.')}>수집 중단</button>}
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => { if (confirm('이 계정의 확인 정보와 장기 활동 기록을 삭제할까요? 공용 게임 비교 목록은 유지됩니다.')) void action(() => steamApi.eraseActivity(account.steamId), '계정 확인 정보와 장기 활동 기록을 삭제했습니다.'); }}>기록 삭제</button>
          </div>
        </li>;
      })}</ul>

    </>}
  </section>;
}

const styles = {
  panel: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '12px', padding: 'var(--panel-padding)', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '16px' },
  hint: { color: 'var(--slate)', fontSize: '13px', overflowWrap: 'anywhere' as const },
  warning: { color: 'var(--accent-pink)', fontSize: '13px' },
  notice: { backgroundColor: 'var(--surface-soft)', borderRadius: '8px', padding: '16px', display: 'grid', gap: '8px', fontSize: '14px', lineHeight: 1.6 },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  row: { borderTop: '1px solid var(--hairline)', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '16px' },
  account: { display: 'grid', gap: '4px', minWidth: 0, overflowWrap: 'anywhere' as const },
  actions: { display: 'flex', flexWrap: 'wrap' as const, gap: '8px' },
  check: { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer' },
};
