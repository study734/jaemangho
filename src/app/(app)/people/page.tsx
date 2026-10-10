import Link from 'next/link';
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
              {p.image ? <img src={p.image} alt="" width={36} height={36} className="friend-avatar" /> : <span className="friend-avatar friend-avatar-empty" aria-hidden="true">{p.name.slice(0, 1)}</span>}
              <span className="friend-text"><b>{p.name}</b><small>롤 {p.lolCount} · Steam {p.steamCount}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
