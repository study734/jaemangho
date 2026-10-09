'use client';

import { useCallback, useEffect, useState } from 'react';
import { type ActivitySettings as Settings, steamApi, steamErrorMessage } from './api';

export function SteamActivitySettings({ linkResult }: { linkResult?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setSettings(await steamApi.activity()); setError(null); }
    catch (e) { setError(steamErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const action = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(null); setMessage(null);
    try { await work(); await load(); setMessage(success); setConfirmed(false); }
    catch (e) { setError(steamErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const linkMessage = linkResult === 'verified' ? 'Steam 계정을 확인했습니다. 주간 수집은 별도로 요청해야 시작됩니다.'
    : linkResult === 'already-linked' ? '이 Steam 계정은 다른 사용자에게 이미 확인돼 있습니다.'
      : linkResult === 'failed' ? 'Steam 계정 확인에 실패했습니다. 다시 시도해 주세요.' : null;

  return <section style={styles.panel} aria-labelledby="steam-activity-heading">
    <div style={styles.head}>
      <div>
        <h3 id="steam-activity-heading" className="heading-4">내 Steam 활동 기록 설정</h3>
        <p style={styles.hint}>게임 비교와 별개로, 확인된 내 계정의 플레이 시간 변화를 남길지 직접 정합니다.</p>
      </div>
      <a className="btn btn-secondary" href="/api/steam/activity/start">Steam 계정 확인</a>
    </div>
    {(linkMessage || message) && <p role="status" style={styles.hint}>{message ?? linkMessage}</p>}
    {error && <p role="alert" style={styles.warning}>{error}</p>}
    {loading && <p style={styles.hint}>설정을 불러오는 중입니다.</p>}
    {!loading && settings && <>
      <div style={styles.notice}>
        <p><strong>수집 내용</strong> · 공개된 보유 게임의 Steam ID, 게임 ID, 누적 플레이 분, 조회 시각과 그 사이의 증가분을 주 1회 확인합니다. 실제 플레이 시각은 알 수 없습니다.</p>
        <p><strong>보관과 삭제</strong> · 원본 응답은 장기 보관하지 않으며, 기록은 직접 삭제할 때까지 남습니다. 중단하면 이후 주간 조회를 멈추고 기존 기록은 유지합니다.</p>
        <p><strong>저장 국가</strong> · {settings.storageCountry ?? '확인되지 않았습니다. 현재 수집 요청을 받을 수 없습니다.'} <a href="/privacy/steam">개인정보 안내 자세히 보기</a></p>
      </div>
      {settings.accounts.length === 0 && <p style={styles.hint}>확인된 Steam 계정이 없습니다. 위 버튼에서 본인 계정을 확인할 수 있습니다.</p>}
      <ul style={styles.list}>{settings.accounts.map((account) => {
        const active = !!account.requestedAt && !account.stoppedAt;
        return <li key={account.steamId} style={styles.row}>
          <div style={styles.account}>
            <strong>{account.name}</strong><span style={styles.hint}>{account.steamId}</span>
            <span style={styles.hint}>{active ? '주간 수집 요청됨' : account.requestedAt ? '수집 중단됨' : '수집 요청 전'}
              {account.lastSuccessAt ? ` · 마지막 성공 ${new Date(account.lastSuccessAt).toLocaleDateString('ko-KR')}` : ''}</span>
          </div>
          <div style={styles.actions}>
            {!active && settings.storageCountry && <button className="btn btn-primary" disabled={busy || !confirmed}
              onClick={() => void action(() => steamApi.requestActivity(account.steamId, settings.noticeVersion), '주간 수집을 요청했습니다.')}>주간 수집 요청</button>}
            {active && <button className="btn btn-secondary" disabled={busy}
              onClick={() => void action(() => steamApi.stopActivity(account.steamId), '주간 수집을 중단했습니다.')}>수집 중단</button>}
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => { if (confirm('이 계정의 확인 정보와 장기 활동 기록을 삭제할까요? 공용 게임 비교 목록은 유지됩니다.')) void action(() => steamApi.eraseActivity(account.steamId), '계정 확인 정보와 장기 활동 기록을 삭제했습니다.'); }}>기록 삭제</button>
          </div>
        </li>;
      })}</ul>
      {settings.storageCountry && settings.accounts.some((account) => !account.requestedAt || !!account.stoppedAt) &&
        <label style={styles.check}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 위 수집 항목·주기·보관·저장 국가를 확인했고 내 계정의 수집을 요청합니다.</label>}
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
