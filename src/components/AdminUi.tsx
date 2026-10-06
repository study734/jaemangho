import type { CSSProperties, ReactNode } from 'react';

// 관리자 화면 공용 조각. 색·모서리·간격은 DESIGN.md의 토큰을 따른다.
export const adminStyles: Record<string, CSSProperties> = {
  panel: { padding: 'clamp(16px, 3vw, 24px)', color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, minWidth: 0 },
  header: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 },
  title: { color: 'var(--ink)', margin: 0 },
  muted: { color: 'var(--slate)', fontSize: 13, lineHeight: 1.6, margin: '12px 0' },
  list: { paddingLeft: 20, lineHeight: 1.7, overflowWrap: 'anywhere' },
  scroll: { overflowX: 'auto', marginTop: 12 },
  table: { width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 14, lineHeight: 1.6 },
  cell: { padding: '12px', borderBottom: '1px solid var(--hairline)', textAlign: 'left', minWidth: 90, overflowWrap: 'anywhere' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  input: { display: 'block', background: 'var(--surface-soft)', color: 'var(--ink)', border: '1px solid var(--hairline-strong)', borderRadius: 8, padding: '8px 12px', minHeight: 44, font: 'inherit' },
  danger: { borderColor: '#ff4a4a', color: '#ff4a4a' },
};

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return <section style={adminStyles.panel}>
    <div style={adminStyles.header}>
      <h3 className="heading-3" style={adminStyles.title}>{title}</h3>
      {actions}
    </div>
    {children}
  </section>;
}

// 표는 이 구역 안에서만 가로로 스크롤한다.
export function ScrollTable({ head, children }: { head: string[]; children: ReactNode }) {
  return <div style={adminStyles.scroll}><table style={adminStyles.table}>
    <thead><tr>{head.map((t, i) => <th key={t || i} style={{ ...adminStyles.cell, color: 'var(--slate)', fontWeight: 600 }}>{t}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>;
}
