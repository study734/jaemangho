import { SteamGames } from '@/features/steam';

export default async function SteamPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SteamGames key={q ?? ''} initialQuery={typeof q === 'string' ? q.slice(0, 120) : ''} />;
}
