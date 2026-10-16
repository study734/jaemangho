import { SteamWithAi } from '../ai';

export default async function SteamPage({ searchParams }: { searchParams: Promise<{ q?: string; 'steam-link'?: string }> }) {
  const { q, 'steam-link': linkResult } = await searchParams;
  return <SteamWithAi key={q ?? ''} initialQuery={typeof q === 'string' ? q.slice(0, 120) : ''}
    linkResult={typeof linkResult === 'string' ? linkResult : undefined} />;
}
