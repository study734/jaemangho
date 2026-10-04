import { notFound } from 'next/navigation';
import { getPerson, listUnowned } from '@/server/people';
import { topPlayed } from '@/server/steam/games';
import { Profile } from './profile';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getPerson(id);
  if (!person) notFound();
  const [unowned, tops] = await Promise.all([listUnowned(), Promise.all(person.steam.map((a) => topPlayed(a.steamId)))]);
  return (
    <Profile
      person={person}
      unowned={unowned}
      topGames={Object.fromEntries(person.steam.map((a, i) => [a.steamId, tops[i]]))}
    />
  );
}
