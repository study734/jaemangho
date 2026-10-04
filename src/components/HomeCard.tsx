import type { ReactNode } from 'react';
import Link from 'next/link';

// 홈 화면의 주제 카드 틀. 내용은 각 주제(기능)가 만들어 children으로 넘긴다.
export function HomeCard({ title, href, cta, children }: { title: string; href: string; cta: string; children: ReactNode }) {
  return (
    <section style={styles.card}>
      <h3 className="heading-5" style={styles.title}>{title}</h3>
      <div style={styles.body}>{children}</div>
      <Link href={href} className="btn btn-secondary" style={styles.cta}>{cta}</Link>
    </section>
  );
}

const styles = {
  card: { backgroundColor: '#001e2b', border: '1px solid #1c4558', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  title: { color: '#ffffff' },
  body: { flexGrow: 1, color: '#a8b3bc', fontSize: '14px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  cta: { alignSelf: 'flex-start', padding: '8px 16px', fontSize: '13px' },
};
