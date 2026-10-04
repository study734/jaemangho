import { notFound } from 'next/navigation';
import { awardsForUser } from '@/server/chat/awards';
import { getPerson, listUnowned } from '@/server/people';
import { topPlayed } from '@/server/steam/games';
import { Profile } from './profile';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getPerson(id);
  if (!person) notFound();
  const [unowned, tops, awards] = await Promise.all([
    listUnowned(),
    Promise.all(person.steam.map((a) => topPlayed(a.steamId))),
    awardsForUser(id).catch(() => []), // 칭호를 못 불러와도 프로필은 보인다
  ]);
  return (
    <Profile
      person={person}
      unowned={unowned}
      awards={awards}
      topGames={Object.fromEntries(person.steam.map((a, i) => [a.steamId, tops[i]]))}
    />
  );
}
