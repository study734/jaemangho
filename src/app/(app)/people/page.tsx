import Link from 'next/link';
import { listPeople } from '@/server/people';

export default async function PeoplePage() {
  const people = await listPeople();
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>멤버</h2>
        <p style={styles.hint}>디스코드로 로그인한 친구들입니다. 이름을 누르면 연결된 롤·Steam 계정을 볼 수 있습니다.</p>
      </header>
      <ul style={styles.grid}>
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.id}`} style={styles.card}>
              {p.image ? <img src={p.image} alt="" width={44} height={44} style={styles.avatar} /> : <span style={{ ...styles.avatar, width: 44, height: 44 }} />}
              <span style={styles.name}>{p.name}</span>
              <span style={styles.meta}>롤 {p.lolCount} · Steam {p.steamCount}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  container: { padding: 'var(--page-padding)', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  hint: { color: 'var(--slate)', fontSize: '14px' },
  grid: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' },
  card: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '8px', padding: '20px', backgroundColor: 'var(--canvas-dark)', border: '1px solid var(--hairline)', borderRadius: '12px', textDecoration: 'none' },
  avatar: { borderRadius: '50%', backgroundColor: 'var(--hairline)', display: 'inline-block' },
  name: { color: 'var(--ink)', fontWeight: 600 },
  meta: { color: 'var(--slate)', fontSize: '12px' },
};
