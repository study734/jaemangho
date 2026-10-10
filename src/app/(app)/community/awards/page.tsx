import Link from 'next/link';
import { TITLES } from '@/lib/titles';
import { type AwardRow, listAwards } from '@/server/chat/awards';
import { chatNotice } from '@/server/chat/notice';

const weekLabel = (start: string) => {
  const d = new Date(`${start}T00:00:00+09:00`);
  const end = new Date(d.getTime() + 6 * 86_400_000);
  const f = (x: Date) => x.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' });
  return `${f(d)} ~ ${f(end)}`;
};

// 주간 시상식: 한국 시간 월~일을 한 주로, 끝난 주마다 칭호를 줍니다. 칭호는 프로필에 모입니다.
export default async function AwardsPage() {
  const awards = await listAwards();
  const weeks = [...new Set(awards.map((a) => a.week))];
  const byWeek = (w: string) => awards.filter((a) => a.week === w);
  const name = (a: AwardRow) => (a.authorUserId ? <Link href={`/people/${a.authorUserId}`} style={styles.link}>{a.authorName}</Link> : <span>{a.authorName}</span>);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>시상식</h2>
        <p style={styles.hint}>매주 월요일에 지난주(월~일) 칭호가 나옵니다. 메시지 수, 시간대, 답글·반응 수로 정하고, {chatNotice()}</p>
      </header>

      {weeks.length === 0 ? (
        <p style={styles.hint}>아직 시상식이 없습니다. 한 주가 끝나면 첫 칭호가 나옵니다.</p>
      ) : (
        weeks.map((w) => (
          <section key={w} style={styles.panel}>
            <h3 className="heading-5" style={styles.panelTitle}>{weekLabel(w)}</h3>
            <ul style={styles.list}>
              {(Object.keys(TITLES) as (keyof typeof TITLES)[]).flatMap((key) => {
                const winners = byWeek(w).filter((a) => a.title === key);
                if (!winners.length) return [];
                const t = TITLES[key];
                return [
                  <li key={key} style={styles.row}>
                    <span style={styles.badge}>{t.label}</span>
                    <span style={styles.who}>
                      {winners.map((a, i) => (
                        <span key={a.authorName}>{i > 0 && ', '}{name(a)}</span>
                      ))}
                    </span>
                    <span style={styles.ago}>{winners.length === 1 && winners[0].value > 0 ? `${winners[0].value.toLocaleString()} ${t.unit}` : t.blurb}</span>
                  </li>,
                ];
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

const styles = {
  container: { padding: 'var(--page-padding)', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  hint: { color: 'var(--slate)', fontSize: '13px' },
  panel: { backgroundColor: 'var(--canvas-dark)', border: '1px solid var(--hairline)', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  panelTitle: { color: 'var(--ink)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--hairline)', fontSize: '14px', color: 'var(--ink)' },
  badge: { fontSize: '12px', fontWeight: 700, color: '#ffb703', border: '1px solid rgba(255, 183, 3, 0.5)', borderRadius: '4px', padding: '2px 10px', whiteSpace: 'nowrap' as const, minWidth: '72px', textAlign: 'center' as const },
  who: { flexGrow: 1 },
  link: { color: 'var(--ink)' },
  ago: { color: 'var(--steel)', fontSize: '12px', textAlign: 'right' as const },
};
