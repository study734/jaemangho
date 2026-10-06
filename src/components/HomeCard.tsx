import type { ReactNode } from 'react';
import Link from 'next/link';

// 홈 화면의 주제 카드 틀. 내용은 각 주제(기능)가 만들어 children으로 넘긴다.
export function HomeCard({ title, subtitle, className, icon, href, cta, children }: { title: string; subtitle?: string; className?: string; icon?: ReactNode; href: string; cta: string; children: ReactNode }) {
  return (
    <section className={className} style={styles.card}>
      <div className="home-card-heading"><h3 className="heading-5 visual-heading" style={styles.title}>{icon}{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      <div style={styles.body}>{children}</div>
      <Link href={href} className="btn btn-secondary" style={styles.cta}>{cta}</Link>
    </section>
  );
}

const styles = {
  card: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '12px', padding: 'var(--panel-padding)', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  title: { color: 'var(--ink)' },
  body: { flexGrow: 1, minWidth: 0, color: 'var(--slate)', fontSize: '14px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  cta: { alignSelf: 'flex-start', padding: '8px 16px', fontSize: '13px' },
};
