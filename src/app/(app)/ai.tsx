'use client';

import { AiPanel } from '@/features/ai';
import { SteamGames } from '@/features/steam';
import { useLol } from '@/features/lol';
import type { AiContext } from '@/server/ai/context';
import { lolContext, steamContext } from './ai-context';

export function AiInsight({ context }: { context: AiContext }) {
  return <div style={{ marginTop: 24, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
    <AiPanel key={JSON.stringify(context)} context={context} />
  </div>;
}

export function SteamWithAi(props: { initialQuery: string; linkResult?: string }) {
  return <SteamGames {...props} renderAnalysis={snapshot => {
    const context = steamContext(snapshot);
    return context ? <AiInsight context={context} /> : null;
  }} />;
}

export function LolAi({ view }: { view: 'overview' | 'synergy' | 'mastery' }) {
  const { members, isLoading } = useLol();
  if (isLoading || !members.length) return null;
  return <section style={{ padding: '0 var(--page-padding) var(--page-padding)' }}>
    <AiInsight context={lolContext(members, view)} />
    <details style={{ color: 'var(--slate)', fontSize: 13, marginTop: 12 }}><summary>플레이어 번호와 분석 범위</summary>
      <p>현재 불러온 최대 40명·각 10경기·숙련도 5개를 분석해요. 상세 전적이 없으면 소환사 상세를 먼저 열어 주세요.</p>
      <p>{members.slice(0, 40).map((member, i) => `플레이어 ${i + 1}: ${member.gameName}#${member.tagLine}`).join(' · ')}</p>
    </details>
  </section>;
}
