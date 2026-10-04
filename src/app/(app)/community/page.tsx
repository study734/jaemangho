import Link from 'next/link';
import { HIGHLIGHT_MIN_REACTIONS, listHighlights } from '@/server/chat/highlights';

const ago = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

// 개념글 보관함: 반응이 일정 수 이상 달린 메시지를 계속 모아 둔다. 글 내용은 저장하지 않고 디스코드 링크로 연다.
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { items, total, pages } = await listHighlights(page);
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>개념글</h2>
        <p style={styles.hint}>반응이 {HIGHLIGHT_MIN_REACTIONS}개 이상 달린 메시지가 자동으로 모입니다 ({total.toLocaleString()}개). 글 내용은 읽지 않고, 누르면 디스코드로 이동합니다.</p>
      </header>

      {items.length === 0 ? (
        <p style={styles.hint}>아직 개념글이 없습니다. 반응이 {HIGHLIGHT_MIN_REACTIONS}개 이상 달리면 여기에 모입니다.</p>
      ) : (
        <ul style={styles.list}>
          {items.map((h) => (
            <li key={h.url} style={styles.row}>
              <span style={styles.tag}>{h.topEmoji ?? '👍'} {h.reactions}</span>
              <a href={h.url} target="_blank" rel="noopener noreferrer" style={styles.link}>{h.authorName}님의 메시지 보러 가기</a>
              <span style={styles.ago}>{ago(h.at)}</span>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav style={styles.pager} aria-label="페이지">
          {page > 1 && <Link href={`/community?page=${page - 1}`} className="btn btn-secondary" style={styles.pageBtn}>이전</Link>}
          <span style={styles.hint}>{page} / {pages}</span>
          {page < pages && <Link href={`/community?page=${page + 1}`} className="btn btn-secondary" style={styles.pageBtn}>다음</Link>}
        </nav>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '32px', flexGrow: 1, display: 'flex', flexDirection: 'column' as const, gap: '24px', overflowY: 'auto' as const, minHeight: 0 },
  header: { borderBottom: '1px solid #1c4558', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  hint: { color: '#a8b3bc', fontSize: '13px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, backgroundColor: '#001e2b', border: '1px solid #1c4558', borderRadius: '12px' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid #1c4558', fontSize: '14px' },
  tag: { fontSize: '12px', fontWeight: 700, color: '#00ed64', border: '1px solid rgba(0, 237, 100, 0.4)', borderRadius: '999px', padding: '2px 10px', whiteSpace: 'nowrap' as const },
  link: { flexGrow: 1, color: '#ffffff' },
  ago: { color: '#7c8c9a', fontSize: '12px', whiteSpace: 'nowrap' as const },
  pager: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' },
  pageBtn: { padding: '6px 16px', fontSize: '13px' },
};
