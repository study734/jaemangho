'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Settings, summarizeRoster, useLol } from '@/features/lol';
import { Sidebar } from '@/components/Sidebar';
import { sectionOf } from '@/components/nav';
import { MobileNavigation, TopBar } from '@/components/TopBar';
import { ChannelHeader, ChannelSidebar, ServerRail } from '@/components/ChannelShell';
import { UiIcon } from '@/components/VisualImage';
import { JaesuniMessage } from '@/components/JaesuniMessage';
import { SettingsDialog } from '@/components/SettingsDialog';

const CHANNEL_LINES: Record<string, string> = {
  '/steam': '같이 할 게임은 여기서 찾으면 돼. 멤버를 고르면 보유 게임 비교와 추천을 보여줄게.',
  '/lol': '친구들의 랭크와 최근 전적을 모아뒀어. 소환사를 누르면 자세히 볼 수 있어.',
  '/lol/squad': '같이 볼 소환사들을 등록하는 곳이야. Riot ID로 검색해서 추가할 수 있어.',
  '/lol/synergy': '함께한 경기 기록으로 듀오 성적을 비교해줄게.',
  '/lol/mastery': '친구들이 자주 쓰는 챔피언과 숙련도를 여기서 확인할 수 있어.',
  '/community': '반응과 답글이 모인 기록이야. 원문은 각 링크에서 확인할 수 있어.',
  '/community/awards': '한 주가 끝나면 실제 기록으로 칭호를 정리해. 지난 수상자들은 여기 있어.',
  '/play': '게임 찾기와 팀 꾸리기는 여기 모아뒀어. 필요한 기능을 골라.',
  '/memories': '함께한 기록을 모아뒀어. 개념글, 시상식, 친구들의 칭호로 이어져.',
};

// 앱 틀: 사이드바 + 상단 안내(로딩/오류/동기화) + 현재 화면
export function Frame({ isAdmin, userName, children }: { isAdmin: boolean; userName: string; children: ReactNode }) {
  const { members, isLoading: lolLoading, error, dismissError, refreshAll } = useLol();
  // 로딩 배너와 동기화 버튼은 롤 데이터용이라 롤 화면에서만 보인다
  const pathname = usePathname();
  const [membersVisible, setMembersVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 화면이 열릴 때 한 번 센다(누가 열었는지는 저장하지 않는다). 실패해도 화면에는 영향이 없다.
  const lastTracked = useRef<string | null>(null);
  useEffect(() => {
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: pathname }), keepalive: true }).catch(() => {});
  }, [pathname]);
  const onLol = pathname.startsWith('/lol');
  const isLoading = onLol && lolLoading;
  const syncAction = onLol && !lolLoading ? (
    <div style={styles.syncRow}>
      <button className="btn btn-secondary" style={styles.syncBtn} onClick={() => refreshAll()}>
        <UiIcon name="arrow-repeat" />
        롤 정보 다시 불러오기
      </button>
    </div>
  ) : null;

  return (
    <div className={`app-frame${membersVisible ? '' : ' members-panel-hidden'}`} style={styles.appContainer}>
      <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
      <ServerRail />
      <ChannelSidebar summary={summarizeRoster(members)} isAdmin={isAdmin} userName={userName} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="app-column">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <ChannelHeader isAdmin={isAdmin} membersVisible={membersVisible} onToggleMembers={() => setMembersVisible(visible => !visible)} />
      <div className="app-body" style={styles.body}>
      {sectionOf(pathname) !== 'home' && <Sidebar isAdmin={isAdmin} />}

      <main id="main-content" tabIndex={-1} style={styles.mainPane}>
        {isLoading && (
          <div role="status" style={styles.loadingBanner}>
            <span className="pulse-indicator" style={{ marginRight: '8px' }} />
            라이엇 서버로부터 소환사들의 최신 전적을 받아오고 있습니다...
          </div>
        )}

        {onLol && error && (
          <div role="alert" style={styles.errorBanner}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
              <UiIcon name="exclamation-triangle" />
              <span>{error}</span>
            </div>
            <button className="btn" style={styles.errorCloseBtn} aria-label="오류 안내 닫기" onClick={dismissError}>
              닫기
            </button>
          </div>
        )}

        {CHANNEL_LINES[pathname] ? (
          <div className="jaesuni-channel-feed" key={pathname}>
            <JaesuniMessage line={CHANNEL_LINES[pathname]}>
              {syncAction}
              <div className="jaesuni-tool-content">{children}</div>
            </JaesuniMessage>
          </div>
        ) : <>{syncAction}{children}</>}
      </main>
      </div>
      <MobileNavigation />
      </div>
      {settingsOpen && <SettingsDialog userName={userName} isAdmin={isAdmin} onClose={() => setSettingsOpen(false)}><Settings embedded /></SettingsDialog>}
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  appContainer: { display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' },
  body: { display: 'flex', flexGrow: 1, minHeight: 0, minWidth: 0 },
  mainPane: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--surface-soft)',
    position: 'relative',
    overflow: 'hidden',
  },
  loadingBanner: {
    backgroundColor: 'var(--accent-pink)',
    color: 'var(--canvas-dark)',
    padding: '8px 24px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  syncRow: { padding: '16px var(--page-padding) 0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 },
  syncBtn: { fontSize: '12.5px', padding: '6px 14px' },
  errorBanner: {
    backgroundColor: '#fff8e0',
    color: '#946f3f',
    padding: '12px 24px',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1.5px solid #fa6e39',
    zIndex: 5,
  },
  errorCloseBtn: {
    fontSize: '11px',
    padding: '4px 10px',
    color: '#946f3f',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: '1px solid #946f3f',
    borderRadius: '4px',
    marginLeft: '16px',
    fontWeight: 600,
  },
};
