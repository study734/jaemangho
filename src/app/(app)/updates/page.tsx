import { patchNotesFor } from '@/lib/patch-notes';

export default function UpdatesPage() {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>패치노트</h2>
        <p style={styles.hint}>재망호에 추가되고 바뀐 기능을 최신순으로 모았어요.</p>
      </header>
      {patchNotesFor('web').map(note => (
        <section key={`${note.date}-${note.title}`} style={styles.panel}>
          <h3 className="heading-5" style={styles.panelTitle}>{note.title} <time dateTime={note.date} style={styles.date}>{note.date}</time></h3>
          <ul style={styles.list}>{note.items.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
      ))}
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
  date: { color: 'var(--steel)', fontSize: '12px', fontWeight: 400, marginLeft: '8px' },
  list: { margin: 0, paddingLeft: '20px', color: 'var(--ink)', fontSize: '14px', display: 'flex', flexDirection: 'column' as const, gap: '6px' },
};
