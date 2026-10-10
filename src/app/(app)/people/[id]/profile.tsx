'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LolAccountBadge, rosterApi } from '@/features/lol';
import { steamApi } from '@/features/steam';
import { TITLES, type TitleKey } from '@/lib/titles';

interface Lol { id: string; gameName: string; tagLine: string }
interface Steam { steamId: string; name: string; avatar: string | null }
interface Person { id: string; name: string; image: string | null; lastLogin: string; lol: Lol[]; steam: Steam[] }

const hours = (m: number) => `${Math.max(1, Math.round(m / 60)).toLocaleString()}시간`;

export function Profile({ person, unowned, topGames, awards }: {
  person: Person;
  awards: { title: TitleKey; count: number; lastWeek: string }[];
  unowned: { lol: Lol[]; steam: Steam[] };
  topGames: Record<string, { name: string; minutes: number }[] | null>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // 주인 지정/해제 후 서버 데이터를 다시 불러온다
  const run = (job: () => Promise<unknown>) => {
    if (saving) return;
    setError(null); setMessage(null);
    startSaving(async () => {
      try { await job(); setMessage('계정 연결 정보를 저장했습니다.'); router.refresh(); }
      catch { setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    });
  };
  const setLolOwner = (a: Lol, ownerId: string | null) => run(() => rosterApi.update({ id: a.id, gameName: a.gameName, tagLine: a.tagLine, ownerId }));
  const setSteamOwner = (a: Steam, ownerId: string | null) => run(() => steamApi.setOwner(a.steamId, ownerId));

  const hasUnowned = unowned.lol.length + unowned.steam.length > 0;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        {person.image ? <img src={person.image} alt="" width={64} height={64} style={styles.avatar} /> : <span style={{ ...styles.avatar, width: 64, height: 64 }} />}
        <div>
          <h2 className="heading-3" style={styles.title}>{person.name}</h2>
          <p style={styles.hint} suppressHydrationWarning>마지막 로그인 {new Date(person.lastLogin).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 한국 시간</p>
        </div>
      </header>

      {error && <div style={styles.error} role="alert">{error}</div>}
      {(saving || message) && <p style={styles.hint} role="status">{saving ? '계정 연결 정보를 저장하는 중입니다.' : message}</p>}

      <section style={styles.panel}>
        <h3 className="heading-5" style={styles.panelTitle}>칭호</h3>
        {awards.length === 0 ? <p style={styles.hint}>아직 받은 칭호가 없습니다. 매주 월요일 시상식에서 나옵니다.</p> : (
          <ul style={{ ...styles.list, flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
            {awards.map((a) => (
              <li key={a.title} style={styles.award} title={TITLES[a.title].blurb}>
                {TITLES[a.title].label}{a.count > 1 && <span style={styles.awardCount}> ×{a.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={styles.panel}>
        <h3 className="heading-5" style={styles.panelTitle}>롤</h3>
        {person.lol.length === 0 ? <p style={styles.hint}>연결된 롤 계정이 없습니다.</p> : (
          <ul style={styles.list}>
            {person.lol.map((a) => (
              <li key={a.id} style={styles.row}>
                <LolAccountBadge id={a.id} gameName={a.gameName} tagLine={a.tagLine} />
                <button className="btn btn-ghost" style={styles.small} disabled={saving} onClick={() => setLolOwner(a, null)}>연결 해제</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={styles.panel}>
        <h3 className="heading-5" style={styles.panelTitle}>Steam</h3>
        {person.steam.length === 0 ? <p style={styles.hint}>연결된 Steam 계정이 없습니다. 디스코드에 Steam을 연결해 두고 다시 로그인하면 자동으로 연결됩니다.</p> : (
          <ul style={styles.list}>
            {person.steam.map((a) => {
              const top = topGames[a.steamId];
              return (
              <li key={a.steamId} style={{ ...styles.row, flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
                <div style={styles.between}>
                  <span style={styles.who}>
                    {a.avatar && <img src={a.avatar} alt="" width={28} height={28} style={styles.avatar} />}
                    {a.name}
                  </span>
                  <button className="btn btn-ghost" style={styles.small} disabled={saving} onClick={() => setSteamOwner(a, null)}>연결 해제</button>
                </div>
                {top === null ? (
                  <span style={styles.hint}>게임 목록을 볼 수 없습니다 (비공개이거나 불러오지 못함)</span>
                ) : (
                  top.map((g) => (
                    <span key={g.name} style={{ ...styles.between, ...styles.hint }}>
                      <span>{g.name}</span>
                      <span>{hours(g.minutes)}</span>
                    </span>
                  ))
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {hasUnowned && (
        <section style={styles.panel}>
          <h3 className="heading-5" style={styles.panelTitle}>주인 없는 계정</h3>
          <p style={styles.hint}>{person.name}님의 계정이면 연결해 주세요.</p>
          <ul style={styles.list}>
            {unowned.lol.map((a) => (
              <li key={a.id} style={styles.row}>
                <span>롤 · {a.gameName}#{a.tagLine}</span>
                <button className="btn btn-secondary" style={styles.small} disabled={saving} onClick={() => setLolOwner(a, person.id)}>이 사람 것으로</button>
              </li>
            ))}
            {unowned.steam.map((a) => (
              <li key={a.steamId} style={styles.row}>
                <span>Steam · {a.name}</span>
                <button className="btn btn-secondary" style={styles.small} disabled={saving} onClick={() => setSteamOwner(a, person.id)}>이 사람 것으로</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const styles = {
  container: { padding: 'var(--page-padding)', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' },
  avatar: { borderRadius: '50%', backgroundColor: 'var(--hairline)', display: 'inline-block' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  hint: { color: 'var(--slate)', fontSize: '13px' },
  error: { backgroundColor: '#fff8e0', color: '#946f3f', border: '1px solid #fa6e39', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' },
  panel: { backgroundColor: 'var(--canvas-dark)', border: '1px solid var(--hairline)', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  panelTitle: { color: 'var(--ink)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', color: 'var(--ink)', fontSize: '14px' },
  between: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  who: { display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ink)' },
  award: { fontSize: '13px', fontWeight: 700, color: '#ffb703', border: '1px solid rgba(255, 183, 3, 0.5)', borderRadius: '4px', padding: '4px 12px' },
  awardCount: { color: 'var(--slate)', fontWeight: 400 },
  small: { fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' as const },
};
