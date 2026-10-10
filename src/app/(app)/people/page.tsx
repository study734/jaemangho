import Link from 'next/link';
import { UiIcon, VisualImage } from '@/components/VisualImage';
import { listPeople } from '@/server/people';

export default async function PeoplePage() {
  const people = await listPeople();
  return (
    <div className="friends">
      <p className="friends-count">모든 멤버 — {people.length}명</p>
      <p className="friends-hint">디스코드로 로그인한 친구들입니다. 이름을 누르면 연결된 롤·Steam 계정을 볼 수 있습니다.</p>
      <ul className="friends-list">
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.id}`} className="friend-row">
              <VisualImage src={p.image} fallback={p.name.slice(0, 1)} width={40} height={40} className="friend-avatar" />
              <span className="friend-text"><b>{p.name}</b><small>롤 {p.lolCount} · Steam {p.steamCount}</small></span>
              <span className="friend-open" aria-hidden="true"><UiIcon name="arrow-right" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
