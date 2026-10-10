import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { scoreLabel } from '@/lib/chat-format';
import { chatNotice } from '@/server/chat/notice';
import { HIGHLIGHT_TOP, listHighlights } from '@/server/chat/highlights';
import { getFunniestMessages, getHotMoments } from '@/server/chat/moments';

const cachedHotMoments = unstable_cache(() => getHotMoments(), ['community-hot-moments'], { revalidate: 60 });
const cachedFunniestMessages = unstable_cache(() => getFunniestMessages(), ['community-funniest-messages'], { revalidate: 60 });

const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

// 커뮤: 개념글 보관함(반응+답글이 큰 메시지가 자동으로 모임), 뜨거웠던 순간, 웃음 유발 메시지(웃음 분석을 켰을 때만).
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [{ items, total, pages }, moments, funny] = await Promise.all([
    listHighlights(page),
    cachedHotMoments().catch(() => []), // 이 두 목록이 실패해도 개념글은 보인다
    cachedFunniestMessages().catch(() => []),
  ]);
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 className="heading-3" style={styles.title}>개념글</h2>
        <p style={styles.hint}>매일 최근 8일 중 반응과 답글을 가장 많이 받은 메시지 상위 {HIGHLIGHT_TOP}개가 자동으로 모입니다 ({total.toLocaleString()}개). {chatNotice()} 누르면 디스코드로 이동합니다.</p>
      </header>

      {items.length === 0 ? (
        <p style={styles.hint}>아직 개념글이 없습니다. 반응이나 답글을 받은 메시지가 생기면 여기에 모입니다.</p>
      ) : (
        <ul style={styles.list}>
          {items.map((h) => (
            <li key={h.url} style={styles.row}>
              <span style={styles.tag}>{scoreLabel(h.topEmoji, h.reactions, h.replies)}</span>
              <a href={h.url} target="_blank" rel="noopener noreferrer" style={styles.link}>{h.authorName}님의 메시지 보러 가기</a>
              <span style={styles.ago}>{day(h.at)}</span>
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

      {moments.length > 0 && (
        <section style={styles.panel}>
          <h3 className="heading-5" style={styles.panelTitle}>뜨거웠던 순간 (최근 8일)</h3>
          <p style={styles.hint}>10분 동안 여러 명이 몰려서 말한 때. 누르면 그 순간의 첫 메시지로 이동합니다.</p>
          <ul style={styles.plain}>
            {moments.map((m) => (
              <li key={m.url} style={styles.row}>
                <span style={styles.tag}>🔥 {m.messages}개</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer" style={styles.link}>{m.people}명이 10분 동안 {m.messages}개</a>
                <span style={styles.ago}>{when(m.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {funny.length > 0 && (
        <section style={styles.panel}>
          <h3 className="heading-5" style={styles.panelTitle}>웃음 유발 (최근 8일)</h3>
          <p style={styles.hint}>이 말 직후 2분 안에 다른 사람들의 ㅋ가 가장 많이 쏟아진 메시지.</p>
          <ul style={styles.plain}>
            {funny.map((f) => (
              <li key={f.url} style={styles.row}>
                <span style={styles.tag}>ㅋ {f.laugh}</span>
                <a href={f.url} target="_blank" rel="noopener noreferrer" style={styles.link}>{f.authorName}님의 메시지 보러 가기</a>
                <span style={styles.ago}>{when(f.at)}</span>
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
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  hint: { color: 'var(--slate)', fontSize: '13px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, backgroundColor: 'var(--canvas-dark)', border: '1px solid var(--hairline)', borderRadius: '12px' },
  plain: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  panel: { backgroundColor: 'var(--canvas-dark)', border: '1px solid var(--hairline)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  panelTitle: { color: 'var(--ink)' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--hairline)', fontSize: '14px' },
  tag: { fontSize: '12px', fontWeight: 700, color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)', borderRadius: '999px', padding: '2px 10px', whiteSpace: 'nowrap' as const },
  link: { flexGrow: 1, color: 'var(--ink)' },
  ago: { color: 'var(--steel)', fontSize: '12px', whiteSpace: 'nowrap' as const },
  pager: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' },
  pageBtn: { padding: '6px 16px', fontSize: '13px' },
};
