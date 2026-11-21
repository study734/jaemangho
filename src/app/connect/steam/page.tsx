import { redirect } from 'next/navigation';
import { getViewer } from '@/server/viewer';
import { steamSetupStatus } from '@/server/steam/setup';
import { STEAM_FEATURE_NOTICE } from '@/server/steam/consent';
import { STEAM_NOTICE } from '@/lib/steam-notice';
import { VisualImage } from '@/components/VisualImage';
import { ConnectSteam } from '@/features/steam';
import { LoginButton } from '../../login/login-button';

export const metadata = { title: '게임추천 준비 · 재망호' };

// 디스코드 /게임추천 준비 화면(intent/0005): 디스코드 로그인 → Steam 연결 → 이용 동의 → 디스코드로 돌아가기를 한 화면에서.
// 앱 틀(상단 바) 밖에 두어 로그인 전에도 열리고, 로그인하면 이 화면으로 돌아온다. 로그인·차단 판정은 기존 그대로다.
export default async function ConnectSteamPage({ searchParams }: { searchParams: Promise<{ 'steam-link'?: string }> }) {
  const [viewer, { 'steam-link': linkResult }] = await Promise.all([getViewer(), searchParams]);
  if (viewer.status === 'blocked') redirect('/login?error=banned');
  const guildId = process.env.DISCORD_GUILD_ID;
  const discordUrl = guildId && /^\d{17,20}$/.test(guildId) ? `https://discord.com/channels/${guildId}` : null;
  return (
    <main className="lobby login-lobby connect-lobby">
      <VisualImage src="/images/jaesuni-home.webp" fallback="" width={1942} height={809} className="lobby-art" />
      <div className="lobby-veil" aria-hidden="true" />
      <div className="lobby-edge" aria-hidden="true" />
      <div className="lobby-main">
        <section className="lobby-card connect-card" aria-labelledby="connect-title">
          <p className="lobby-tape">디스코드 게임추천</p>
          <h1 id="connect-title" className="lobby-title login-title">게임추천 준비</h1>
          {viewer.status === 'anonymous'
            ? <>
              <p className="subtitle">처음 한 번만 하면 돼요. 디스코드로 로그인하면 디스코드에 연결해 둔 Steam이 자동으로 이어지고, 이용 동의만 하면 끝나요.</p>
              <ol className="connect-steps"><li aria-current="step"><b>디스코드로 로그인</b><span>재망호 서버 멤버만 들어올 수 있어요.</span></li></ol>
              <LoginButton callbackURL="/connect/steam" />
            </>
            : <ConnectSteam status={await steamSetupStatus(viewer.viewer.id)} notice={STEAM_NOTICE} noticeVersion={STEAM_FEATURE_NOTICE}
              linkResult={typeof linkResult === 'string' ? linkResult : undefined} discordUrl={discordUrl} />}
        </section>
      </div>
    </main>
  );
}
