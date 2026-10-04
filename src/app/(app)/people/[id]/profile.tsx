'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LolAccountBadge, rosterApi } from '@/features/lol';
import { steamApi } from '@/features/steam';

interface Lol { id: string; gameName: string; tagLine: string }
interface Steam { steamId: string; name: string; avatar: string | null }
interface Person { id: string; name: string; image: string | null; lastLogin: string; lol: Lol[]; steam: Steam[] }

const hours = (m: number) => `${Math.max(1, Math.round(m / 60)).toLocaleString()}시간`;

export function Profile({ person, unowned, topGames }: {
  person: Person;
  unowned: { lol: Lol[]; steam: Steam[] };
  topGames: Record<string, { name: string; minutes: number }[] | null>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // 주인 지정/해제 후 서버 데이터를 다시 불러온다
  const run = async (job: () => Promise<unknown>) => {
    setError(null);
    try {
      await job();
      router.refresh();
    } catch {
      setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
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
          <p style={styles.hint} suppressHydrationWarning>마지막 접속 {new Date(person.lastLogin).toLocaleString('ko-KR')}</p>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.panel}>
        <h3 className="heading-5" style={styles.panelTitle}>롤</h3>
        {person.lol.length === 0 ? <p style={styles.hint}>연결된 롤 계정이 없습니다.</p> : (
          <ul style={styles.list}>
            {person.lol.map((a) => (
              <li key={a.id} style={styles.row}>
                <LolAccountBadge id={a.id} gameName={a.gameName} tagLine={a.tagLine} />
                <button className="btn btn-ghost" style={styles.small} onClick={() => setLolOwner(a, null)}>연결 해제</button>
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
                  <button className="btn btn-ghost" style={styles.small} onClick={() => setSteamOwner(a, null)}>연결 해제</button>
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
                <button className="btn btn-secondary" style={styles.small} onClick={() => setLolOwner(a, person.id)}>이 사람 것으로</button>
              </li>
            ))}
            {unowned.steam.map((a) => (
              <li key={a.steamId} style={styles.row}>
                <span>Steam · {a.name}</span>
                <button className="btn btn-secondary" style={styles.small} onClick={() => setSteamOwner(a, person.id)}>이 사람 것으로</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '32px', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid #1c4558', paddingBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' },
  avatar: { borderRadius: '50%', backgroundColor: '#1c4558', display: 'inline-block' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  hint: { color: '#a8b3bc', fontSize: '13px' },
  error: { backgroundColor: '#fff8e0', color: '#946f3f', border: '1px solid #fa6e39', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' },
  panel: { backgroundColor: '#001e2b', border: '1px solid #1c4558', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  panelTitle: { color: '#ffffff' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', color: '#ffffff', fontSize: '14px' },
  between: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  who: { display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff' },
  small: { fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' as const },
};
